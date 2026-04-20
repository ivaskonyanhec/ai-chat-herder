import { test, expect } from '../fixtures/test-fixtures';

test.describe('Password reset — API', () => {
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

test.describe('Password reset — UI', () => {
  test('clicking "Forgot password?" on the login screen shows the forgot-password form', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByTestId('login-submit')).toBeVisible();

    await page.getByTestId('forgot-password-link').click();

    await expect(page.getByTestId('forgot-email')).toBeVisible();
    await expect(page.getByTestId('forgot-submit')).toBeVisible();
    await expect(page.getByTestId('login-submit')).not.toBeVisible();
  });

  test('submitting a valid email in the forgot-password form shows the success confirmation', async ({ page, userA }) => {
    await page.goto('/auth');
    await page.getByTestId('forgot-password-link').click();
    await page.getByTestId('forgot-email').fill(userA.email);
    await page.getByTestId('forgot-submit').click();

    await expect(page.getByTestId('forgot-success')).toBeVisible();
    await expect(page.getByTestId('forgot-success')).toContainText(/reset link/i);
  });

  test('navigating to /auth?token=... auto-activates the reset-password form', async ({ page }) => {
    await page.goto('/auth?token=some-test-token');

    await expect(page.getByTestId('reset-new-password')).toBeVisible();
    await expect(page.getByTestId('reset-confirm-password')).toBeVisible();
    await expect(page.getByTestId('reset-submit')).toBeVisible();
    await expect(page.getByTestId('login-submit')).not.toBeVisible();
  });

  test('submitting the reset form with an expired/invalid token shows an error', async ({ page }) => {
    await page.goto('/auth?token=00000000-0000-0000-0000-000000000000');

    await page.getByTestId('reset-new-password').fill('NewPass@1234');
    await page.getByTestId('reset-confirm-password').fill('NewPass@1234');
    await page.getByTestId('reset-submit').click();

    await expect(page.getByTestId('login-error')).toBeVisible();
  });

  test('reset form shows password-mismatch error when passwords differ and form is submitted', async ({ page }) => {
    await page.goto('/auth?token=some-test-token');

    await page.getByTestId('reset-new-password').fill('NewPass@1234');
    await page.getByTestId('reset-confirm-password').fill('DifferentPass@1234');
    await page.getByTestId('reset-confirm-password').blur();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });
});
