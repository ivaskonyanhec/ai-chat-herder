import { connectChat } from '../signalr-client.js';

export function runMessagingScenario(user, roomId, runtimeMs) {
  connectChat(user, roomId, runtimeMs);
}
