import { test, expect } from '../../fixtures/test-fixtures';

/**
 * UAT: Security Hardening (SEC-01, SEC-03, SEC-05)
 *
 * Acceptance criteria verified here:
 *   AC-01: A logged-in user cannot discover another user's email address
 *          by knowing their username.
 *   AC-03a: Uploading a file with a dangerous MIME type (HTML/JS/SVG) is rejected.
 *   AC-03b: Uploading a file that claims to be an image but contains non-image
 *            bytes is rejected.
 *   AC-05: A user cannot set an avatar URL that uses a non-HTTPS scheme.
 */

test.describe('UAT: Security hardening', () => {

  test('AC-01 — A user cannot retrieve another user email via the public username lookup', async ({ api, userA, userB }) => {
    const ctx = await api.authContext(userA.accessToken);
    const res = await ctx.get(`/api/users/by-username/${userB.username}`);
    expect(res.status(), 'lookup should succeed').toBe(200);

    const body = await res.json();
    expect(body, 'response must not leak email').not.toHaveProperty('email');
    expect(body.id).toBe(userB.id);

    await ctx.dispose();
  });

  test('AC-03a — Uploading a script file disguised as any type is blocked by MIME policy', async ({ api, userA }) => {
    const dangerousPayloads = [
      { name: 'xss.html',  mimeType: 'text/html',             content: '<html><script>alert(1)</script></html>' },
      { name: 'steal.js',  mimeType: 'application/javascript', content: 'document.cookie' },
      { name: 'trap.svg',  mimeType: 'image/svg+xml',          content: '<svg><script>alert(1)</script></svg>' },
    ];

    const ctx = await api.authContext(userA.accessToken);

    for (const payload of dangerousPayloads) {
      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: { name: payload.name, mimeType: payload.mimeType, buffer: Buffer.from(payload.content) },
        },
      });
      expect(res.status(), `${payload.mimeType} must be blocked`).toBe(400);
    }

    await ctx.dispose();
  });

  test('AC-03b — Uploading a file that lies about being an image is rejected', async ({ api, userA }) => {
    const ctx = await api.authContext(userA.accessToken);

    const res = await ctx.post('/api/files/upload', {
      multipart: {
        file: {
          name: 'definitely-not-malware.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from('<html><script>evil()</script></html>'),
        },
      },
    });
    expect(res.status(), 'server must reject fake image').toBe(400);
    const body = await res.json();
    expect(body.error).toContain('content does not match');

    await ctx.dispose();
  });

  test('AC-05 — A user cannot set an avatar URL with a non-HTTPS scheme', async ({ api, userA }) => {
    const dangerousUrls = [
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'http://tracking.attacker.com/pixel.gif',
    ];

    const ctx = await api.authContext(userA.accessToken);

    for (const url of dangerousUrls) {
      const res = await ctx.patch('/api/users/me', { data: { avatarUrl: url } });
      expect(res.status(), `${url.slice(0, 30)} must be rejected`).toBe(400);
    }

    const okRes = await ctx.patch('/api/users/me', {
      data: { avatarUrl: 'https://secure-cdn.example.com/avatar.png' },
    });
    expect(okRes.status(), 'HTTPS URL must be accepted').toBe(200);

    await ctx.dispose();
  });
});
