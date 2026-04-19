import http from 'k6/http';
import { check, fail } from 'k6';
import {
  buildRegisterRequest,
  buildLoginRequest,
  parseLoginResponse,
} from './helpers/auth.helper.js';
import { createPublicRoom, buildJoinRoomRequest } from './helpers/room.helper.js';
import { runMessagingScenario } from './scenarios/messaging.scenario.js';
import { runPresenceScenario } from './scenarios/presence.scenario.js';

const targetUsers = Number(__ENV.LOAD_USERS || 300);
const steadyDuration = __ENV.LOAD_STEADY_DURATION || '10m';
const rampUpDuration = __ENV.LOAD_RAMP_UP || '60s';
const rampDownDuration = __ENV.LOAD_RAMP_DOWN || '30s';
const runtimeMs = durationToMs(rampUpDuration) + durationToMs(steadyDuration);

export const options = {
  setupTimeout: '120s',
  scenarios: {
    signalr_chat_load: {
      executor: 'ramping-vus',
      stages: [
        { duration: rampUpDuration, target: targetUsers },
        { duration: steadyDuration, target: targetUsers },
        { duration: rampDownDuration, target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    message_delivery_latency_ms: ['p(95)<3000', 'p(99)<5000'],
    presence_propagation_latency_ms: ['p(95)<2000', 'p(99)<3500'],
    message_delivery_success_rate: ['rate>0.95'],
    presence_delivery_success_rate: ['rate>0.95'],
    websocket_drops: ['count==0'],
  },
};

export function setup() {
  const runId = `${Date.now()}`;

  // Derive email list upfront so login batch can reference it by index.
  const emails = Array.from(
    { length: targetUsers },
    (_, i) => `load_${runId}_${i}@load.test`,
  );

  // Batch 1: register all users concurrently.
  const registerResponses = http.batch(
    Array.from({ length: targetUsers }, (_, i) => buildRegisterRequest(i, runId)),
  );
  registerResponses.forEach((res, i) => {
    if (!check(res, { 'register user succeeded': (r) => r.status === 200 || r.status === 409 })) {
      fail(`Failed to register ${emails[i]}: ${res.status} ${res.body}`);
    }
  });

  // Batch 2: login all users concurrently.
  const loginResponses = http.batch(emails.map(buildLoginRequest));
  const users = loginResponses.map((res, i) => parseLoginResponse(res, emails[i]));

  // Single call: create the shared room.
  const room = createPublicRoom(users[0], runId);

  // Batch 3: join remaining users concurrently.
  const joinResponses = http.batch(users.slice(1).map((u) => buildJoinRoomRequest(u, room.id)));
  joinResponses.forEach((res) => {
    if (!check(res, { 'join public load room succeeded': (r) => r.status === 204 || r.status === 409 })) {
      fail(`Failed to join room ${room.id}: ${res.status} ${res.body}`);
    }
  });

  return { users, roomId: room.id, runId };
}

export default function (data) {
  const user = data.users[(__VU - 1) % data.users.length];
  runPresenceScenario(user, data.roomId, runtimeMs);
  runMessagingScenario(user, data.roomId, runtimeMs);
  // No sleep — socket close timeouts (runtimeMs) control VU lifecycle.
  // With k6/experimental/websockets, the event loop stays alive until all
  // sockets and timers resolve; sleep would block that event loop.
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    '/scripts/results.json': JSON.stringify(data, null, 2),
  };
}

function durationToMs(value) {
  const match = String(value).match(/^(\d+)(ms|s|m)$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 'ms') return amount;
  if (unit === 's') return amount * 1000;
  return amount * 60 * 1000;
}

function textSummary(data) {
  const metrics = data.metrics || {};
  const messageP95 = percentile(metrics.message_delivery_latency_ms, 'p(95)');
  const presenceP95 = percentile(metrics.presence_propagation_latency_ms, 'p(95)');
  const messageSuccess = rate(metrics.message_delivery_success_rate);
  const presenceSuccess = rate(metrics.presence_delivery_success_rate);
  const drops = count(metrics.websocket_drops);

  return [
    'AI Chat Herder k6 load summary',
    `Peak configured users: ${targetUsers}`,
    `Message p95 latency: ${messageP95} ms`,
    `Presence p95 latency: ${presenceP95} ms`,
    `Message delivery success: ${messageSuccess}%`,
    `Presence delivery success: ${presenceSuccess}%`,
    `WebSocket drops: ${drops}`,
    '',
  ].join('\n');
}

function percentile(metric, key) {
  if (!metric || !metric.values || metric.values[key] === undefined) return 'n/a';
  return Math.round(metric.values[key]);
}

function rate(metric) {
  if (!metric || !metric.values || metric.values.rate === undefined) return 'n/a';
  return Math.round(metric.values.rate * 10000) / 100;
}

function count(metric) {
  if (!metric || !metric.values || metric.values.count === undefined) return 'n/a';
  return metric.values.count;
}
