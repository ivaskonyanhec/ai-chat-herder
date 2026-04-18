import { invocation, signalRConnect } from './helpers/websocket.helper.js';
import { setInterval, setTimeout } from 'k6/timers';
import {
  recordMessageMiss,
  recordMessageReceived,
  recordMessageSent,
  recordPresenceMiss,
  recordPresenceObserved,
  recordPresenceSent,
  recordSocketDrop,
} from './helpers/metrics.helper.js';

export function connectPresence(user, roomId, runtimeMs) {
  const pendingPresence = {};
  let invocationId = 0;

  signalRConnect('/hubs/presence', user.accessToken, {
    open(socket) {
      sendIfOpen(socket, invocation(++invocationId, 'JoinRoom', [roomId]));
      setInterval(() => {
        sendIfOpen(socket, invocation(++invocationId, 'Heartbeat', []));
      }, 30000);

      setInterval(() => {
        pendingPresence[user.id] = Date.now();
        recordPresenceSent();
        sendIfOpen(socket, invocation(++invocationId, 'SetAfk', []));
        setTimeout(() => {
          sendIfOpen(socket, invocation(++invocationId, 'SetActive', []));
        }, 1000);
      }, randomInterval(25000, 45000));

      setTimeout(() => socket.close(), runtimeMs);
    },
    message(_socket, message) {
      if (message.type !== 1 || message.target !== 'UserStatusChanged') return;
      const payload = message.arguments && message.arguments[0];
      const sentAt = payload && pendingPresence[payload.userId];
      if (!sentAt) return;
      recordPresenceObserved(Date.now() - sentAt);
      delete pendingPresence[payload.userId];
    },
    close() {
      Object.keys(pendingPresence).forEach((key) => {
        recordPresenceMiss();
        delete pendingPresence[key];
      });
    },
    error() {
      recordSocketDrop();
    },
  });
}

export function connectChat(user, roomId, runtimeMs) {
  const pendingMessages = {};
  let invocationId = 0;

  signalRConnect('/hubs/chat', user.accessToken, {
    open(socket) {
      setInterval(() => {
        const id = `${__VU}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const content = `load-message:${id}`;
        pendingMessages[id] = Date.now();
        recordMessageSent();
        sendIfOpen(socket, invocation(++invocationId, 'SendMessage', [roomId, content, null, null]));
      }, randomInterval(8000, 20000));

      setInterval(() => {
        Object.keys(pendingMessages).forEach((key) => {
          if (Date.now() - pendingMessages[key] > 3000) {
            recordMessageMiss();
            delete pendingMessages[key];
          }
        });
      }, 1000);

      setTimeout(() => socket.close(), runtimeMs);
    },
    message(_socket, message) {
      if (message.type !== 1 || message.target !== 'MessageReceived') return;
      const payload = message.arguments && message.arguments[0];
      const content = payload && payload.content;
      if (!content || content.indexOf('load-message:') !== 0) return;
      const id = content.replace('load-message:', '');
      const sentAt = pendingMessages[id];
      if (!sentAt) return;
      recordMessageReceived(Date.now() - sentAt);
      delete pendingMessages[id];
    },
    close() {
      Object.keys(pendingMessages).forEach((key) => {
        recordMessageMiss();
        delete pendingMessages[key];
      });
    },
    error() {
      recordSocketDrop();
    },
  });
}

function randomInterval(minMs, maxMs) {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

function sendIfOpen(socket, payload) {
  if (socket.readyState === 1) {
    socket.send(payload);
  }
}
