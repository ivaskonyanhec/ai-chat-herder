import http from 'k6/http';
import { check, fail } from 'k6';
import { apiBaseUrl, authHeaders } from './auth.helper.js';

export function createPublicRoom(owner, runId) {
  const res = http.post(`${apiBaseUrl()}/api/rooms`, JSON.stringify({
    name: `load-room-${runId}`,
    description: 'k6 load test room',
    visibility: 'Public',
  }), {
    headers: authHeaders(owner.accessToken),
    tags: { endpoint: 'create-room' },
  });

  if (!check(res, { 'create load room succeeded': (r) => r.status === 200 })) {
    fail(`Failed to create load room: ${res.status} ${res.body}`);
  }

  return res.json();
}

export function joinRoom(user, roomId) {
  const res = http.post(`${apiBaseUrl()}/api/rooms/${roomId}/join`, null, {
    headers: authHeaders(user.accessToken),
    tags: { endpoint: 'join-room' },
  });

  if (!check(res, { 'join public load room succeeded': (r) => r.status === 204 || r.status === 409 })) {
    fail(`Failed to join room ${roomId}: ${res.status} ${res.body}`);
  }
}
