import http from 'k6/http';
import { check, fail } from 'k6';

export const DEFAULT_PASSWORD = 'Load@Test1234!';

export function apiBaseUrl() {
  return __ENV.API_BASE_URL || 'http://backend:8080';
}

export function registerUser(index, runId) {
  const username = `load_${runId}_${index}`;
  const email = `${username}@load.test`;
  const payload = JSON.stringify({
    username,
    email,
    password: DEFAULT_PASSWORD,
    keepSignedIn: true,
  });

  const res = http.post(`${apiBaseUrl()}/api/auth/register`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'register' },
  });

  if (!check(res, { 'register user succeeded': (r) => r.status === 200 || r.status === 409 })) {
    fail(`Failed to register ${email}: ${res.status} ${res.body}`);
  }

  return loginUser(email, DEFAULT_PASSWORD);
}

export function loginUser(email, password) {
  const res = http.post(`${apiBaseUrl()}/api/auth/login`, JSON.stringify({
    email,
    password,
    keepSignedIn: true,
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'login' },
  });

  if (!check(res, { 'login user succeeded': (r) => r.status === 200 })) {
    fail(`Failed to login ${email}: ${res.status} ${res.body}`);
  }

  const body = res.json();
  return {
    id: body.user.id,
    username: body.user.username,
    email,
    accessToken: body.accessToken,
  };
}

export function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}
