import { test, expect } from '../fixtures/test-fixtures';

test.describe('Password reset', () => {
  test('forgot-password returns 200 with a confirmation message for a known email', async ({ api, userA }) => {
    const ctx = await api.context();
    const res = await ctx.post('/api/auth/forgot-password', {
      data: { email: userA.email },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/reset link|sent/i);
    await ctx.dispose();
  });

  test('forgot-password returns 200 even for an unknown email (timing-attack protection)', async ({ api }) => {
    const ctx = await api.context();
    const res = await ctx.post('/api/auth/forgot-password', {
      data: { email: `nobody-${Date.now()}@test.local` },
    });
    expect(res.status(), await res.text()).toBe(200);
    await ctx.dispose();
  });

  test('reset-password with an invalid token returns 400', async ({ api }) => {
    const ctx = await api.context();
    const res = await ctx.post('/api/auth/reset-password', {
      data: {
        token:       '00000000-0000-0000-0000-000000000000',
        newPassword: 'NewPass@1234!',
      },
    });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });
});
