import http from 'k6/http';
import { WebSocket } from 'k6/experimental/websockets';
import { check, fail } from 'k6';

export const SIGNALR_RECORD_SEPARATOR = String.fromCharCode(0x1e);

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function backendBaseUrl() {
  return stripTrailingSlash(__ENV.API_BASE_URL || 'http://backend:8080');
}

export function hubHttpUrl(path) {
  return `${backendBaseUrl()}${path}`;
}

export function hubWsUrl(path) {
  const base = backendBaseUrl().replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${base}${path}`;
}

export function negotiate(hubPath, accessToken) {
  const res = http.post(`${hubHttpUrl(hubPath)}/negotiate?negotiateVersion=1`, null, {
    headers: { Authorization: `Bearer ${accessToken}` },
    tags: { endpoint: `${hubPath}/negotiate` },
  });

  if (!check(res, { [`${hubPath} negotiate succeeded`]: (r) => r.status === 200 })) {
    fail(`SignalR negotiate failed for ${hubPath}: ${res.status} ${res.body}`);
  }

  const body = res.json();
  return body.connectionToken || body.connectionId;
}

export function signalRConnect(hubPath, accessToken, handlers) {
  const token = negotiate(hubPath, accessToken);
  const url = `${hubWsUrl(hubPath)}?id=${encodeURIComponent(token)}&access_token=${encodeURIComponent(accessToken)}`;

  const socket = new WebSocket(url, null, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  socket.addEventListener('open', () => {
    socket.send(frame({ protocol: 'json', version: 1 }));
    if (handlers && handlers.open) handlers.open(socket);
  });

  socket.addEventListener('message', (event) => {
    for (const message of parseFrames(event.data)) {
      if (handlers && handlers.message) handlers.message(socket, message);
    }
  });

  socket.addEventListener('close', () => {
    if (handlers && handlers.close) handlers.close(socket);
  });

  socket.addEventListener('error', (error) => {
    if (handlers && handlers.error) handlers.error(socket, error);
  });

  return socket;
}

export function frame(payload) {
  return `${JSON.stringify(payload)}${SIGNALR_RECORD_SEPARATOR}`;
}

export function invocation(invocationId, target, args) {
  return frame({
    type: 1,
    invocationId: String(invocationId),
    target,
    arguments: args || [],
  });
}

export function parseFrames(raw) {
  return String(raw)
    .split(SIGNALR_RECORD_SEPARATOR)
    .filter(Boolean)
    .map((item) => {
      try {
        return JSON.parse(item);
      } catch (_) {
        return { type: 'parse_error', raw: item };
      }
    });
}
