import { connectPresence } from '../signalr-client.js';

export function runPresenceScenario(user, roomId, runtimeMs) {
  connectPresence(user, roomId, runtimeMs);
}
