import { test, expect } from '../../fixtures/test-fixtures';

/**
 * UAT: Forgot / Reset Password (FP-01, RP-01, RP-02)
 *
 * Acceptance criteria verified here:
 *   AC-FP1: A user who cannot remember their password can trigger a reset
 *           from the login screen and receive visual confirmation that the
 *           email was sent (without revealing whether the address is registered).
 *   AC-RP1: A user who follows the reset link (URL with ?token=) is taken
 *           directly to the set-new-password form, not the login screen.
 *   AC-RP2: If the reset token is invalid or expired, the user sees a clear
 *           error message so they know to request a new link.
 */

test.describe('UAT: Forgot / Reset Password', () => {

  test('AC-FP1 — User triggers a password reset from the login screen and sees confirmation', async ({ page, userA }) => {
    await page.goto('/auth');

    await expect(page.getByTestId('forgot-password-link'), 'forgot-password link must be visible on login screen').toBeVisible();
    await page.getByTestId('forgot-password-link').click();

    await expect(page.getByTestId('forgot-email'), 'forgot-password email form must appear after click').toBeVisible();

    await page.getByTestId('forgot-email').fill(userA.email);
    await page.getByTestId('forgot-submit').click();

    await expect(page.getByTestId('forgot-success'), 'success confirmation must appear after submit').toBeVisible();
    await expect(page.getByTestId('forgot-success')).toContainText(/reset link/i);

    await expect(page.getByTestId('forgot-email'), 'email input should no longer be shown after success').not.toBeVisible();
  });

  test('AC-FP1b — Entering an unknown email still shows confirmation (no enumeration)', async ({ page }) => {
    await page.goto('/auth');
    await page.getByTestId('forgot-password-link').click();

    await page.getByTestId('forgot-email').fill(`nonexistent-${Date.now()}@test.local`);
    await page.getByTestId('forgot-submit').click();

    await expect(page.getByTestId('forgot-success'), 'same success message must appear for unknown email').toBeVisible();
  });

  test('AC-RP1 — Arriving at /auth?token=... shows the set-new-password form directly', async ({ page }) => {
    await page.goto('/auth?token=a-valid-looking-reset-token');

    await expect(page.getByTestId('reset-new-password'), 'new-password field must be shown on arrival').toBeVisible();
    await expect(page.getByTestId('reset-confirm-password')).toBeVisible();
    await expect(page.getByTestId('reset-submit')).toBeVisible();

    await expect(page.getByTestId('login-email'), 'login form must NOT be shown').not.toBeVisible();
    await expect(page.getByTestId('forgot-email'), 'forgot form must NOT be shown').not.toBeVisible();
  });

  test('AC-RP2 — Submitting an expired/invalid token gives a clear error message', async ({ page }) => {
    await page.goto('/auth?token=00000000-0000-0000-0000-000000000000');

    await page.getByTestId('reset-new-password').fill('NewSecurePass@1234');
    await page.getByTestId('reset-confirm-password').fill('NewSecurePass@1234');
    await page.getByTestId('reset-submit').click();

    await expect(page.getByTestId('login-error'), 'error message must appear for invalid token').toBeVisible();
    await expect(page.getByTestId('login-error')).toContainText(/invalid|expired/i);

    await expect(page.getByTestId('reset-success'), 'success banner must NOT appear on failure').not.toBeVisible();
  });
});
