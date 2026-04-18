import { Counter, Rate, Trend } from 'k6/metrics';

export const messageLatency = new Trend('message_delivery_latency_ms', true);
export const presenceLatency = new Trend('presence_propagation_latency_ms', true);
export const messageDeliverySuccess = new Rate('message_delivery_success_rate');
export const presenceDeliverySuccess = new Rate('presence_delivery_success_rate');
export const websocketDrops = new Counter('websocket_drops');
export const reconnectAttempts = new Counter('websocket_reconnect_attempts');
export const messagesSent = new Counter('messages_sent');
export const messagesReceived = new Counter('messages_received');
export const presenceUpdatesSent = new Counter('presence_updates_sent');
export const presenceUpdatesObserved = new Counter('presence_updates_observed');

export function recordMessageSent() {
  messagesSent.add(1);
}

export function recordMessageReceived(latencyMs) {
  messagesReceived.add(1);
  messageDeliverySuccess.add(true);
  messageLatency.add(latencyMs);
}

export function recordMessageMiss() {
  messageDeliverySuccess.add(false);
}

export function recordPresenceSent() {
  presenceUpdatesSent.add(1);
}

export function recordPresenceObserved(latencyMs) {
  presenceUpdatesObserved.add(1);
  presenceDeliverySuccess.add(true);
  presenceLatency.add(latencyMs);
}

export function recordPresenceMiss() {
  presenceDeliverySuccess.add(false);
}

export function recordSocketDrop() {
  websocketDrops.add(1);
}

export function recordReconnectAttempt() {
  reconnectAttempts.add(1);
}
