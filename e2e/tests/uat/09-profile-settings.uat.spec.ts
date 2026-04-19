import { test, expect } from '../../fixtures/test-fixtures';
import { bootstrapAuthenticatedContext } from '../../helpers/auth.helpers';

test.describe('UAT: Profile Settings page', () => {

  test('settings page loads with username and email pre-filled from the backend', async ({ userAPage, userA }) => {
    await userAPage.goto('/app/settings');

    await expect(userAPage.locator('[data-testid="profile-username"]'))
      .toHaveValue(userA.username, { timeout: 10_000 });
    await expect(userAPage.locator('[data-testid="profile-email"]'))
      .toHaveValue(userA.email, { timeout: 5_000 });
  });

  test('change-password shows validation error when new passwords do not match', async ({ userAPage }) => {
    await userAPage.goto('/app/settings');
    await expect(userAPage.locator('[data-testid="current-password"]')).toBeVisible({ timeout: 10_000 });

    await userAPage.fill('[data-testid="current-password"]', 'anything');
    await userAPage.fill('[data-testid="new-password"]', 'newpass123');
    await userAPage.fill('[data-testid="confirm-password"]', 'doesnotmatch');
    await userAPage.click('[data-testid="save-password"]');

    await expect(userAPage.locator('[data-testid="password-error"]')).toBeVisible({ timeout: 3_000 });
    await expect(userAPage.locator('[data-testid="password-error"]'))
      .toContainText('do not match', { ignoreCase: true });
  });

  test('change-password shows validation error when fields are empty', async ({ userAPage }) => {
    await userAPage.goto('/app/settings');
    await expect(userAPage.locator('[data-testid="save-password"]')).toBeVisible({ timeout: 10_000 });

    await userAPage.click('[data-testid="save-password"]');

    await expect(userAPage.locator('[data-testid="password-error"]')).toBeVisible({ timeout: 3_000 });
    await expect(userAPage.locator('[data-testid="password-error"]'))
      .toContainText('required', { ignoreCase: true });
  });

  test('discard button clears all password fields and errors', async ({ userAPage }) => {
    await userAPage.goto('/app/settings');
    await expect(userAPage.locator('[data-testid="current-password"]')).toBeVisible({ timeout: 10_000 });

    await userAPage.fill('[data-testid="current-password"]', 'something');
    await userAPage.fill('[data-testid="new-password"]', 'newpass1');
    await userAPage.fill('[data-testid="confirm-password"]', 'newpass1');
    await userAPage.click('[data-testid="discard-password"]');

    await expect(userAPage.locator('[data-testid="current-password"]')).toHaveValue('');
    await expect(userAPage.locator('[data-testid="new-password"]')).toHaveValue('');
    await expect(userAPage.locator('[data-testid="confirm-password"]')).toHaveValue('');
  });

  test('change-password succeeds end-to-end: shows success message and new password works on backend', async ({ browser, api }) => {
    const user = await api.register();
    const newPassword = 'NewTest@9876!';

    const ctx = await browser.newContext();
    await bootstrapAuthenticatedContext(ctx, user);
    const page = await ctx.newPage();

    await page.goto('/app/settings');
    await expect(page.locator('[data-testid="current-password"]')).toBeVisible({ timeout: 10_000 });

    await page.fill('[data-testid="current-password"]', user.password);
    await page.fill('[data-testid="new-password"]', newPassword);
    await page.fill('[data-testid="confirm-password"]', newPassword);
    await page.click('[data-testid="save-password"]');

    await expect(page.locator('[data-testid="password-success"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="current-password"]')).toHaveValue('', { timeout: 3_000 });
    await expect(page.locator('[data-testid="new-password"]')).toHaveValue('');
    await expect(page.locator('[data-testid="confirm-password"]')).toHaveValue('');

    // Verify the new password actually authenticates on the backend
    const loginResult = await api.login(user.email, newPassword);
    expect(loginResult.accessToken).toBeTruthy();

    await ctx.close();
  });

  test('change-password shows error when current password is wrong', async ({ userAPage }) => {
    await userAPage.goto('/app/settings');
    await expect(userAPage.locator('[data-testid="current-password"]')).toBeVisible({ timeout: 10_000 });

    await userAPage.fill('[data-testid="current-password"]', 'WrongPassword999!');
    await userAPage.fill('[data-testid="new-password"]', 'NewPass12345!');
    await userAPage.fill('[data-testid="confirm-password"]', 'NewPass12345!');
    await userAPage.click('[data-testid="save-password"]');

    await expect(userAPage.locator('[data-testid="password-error"]')).toBeVisible({ timeout: 10_000 });
  });

  test('delete account: cancel confirmation leaves user on settings page', async ({ userAPage }) => {
    await userAPage.goto('/app/settings');
    await expect(userAPage.locator('[data-testid="delete-account-btn"]')).toBeVisible({ timeout: 10_000 });

    userAPage.on('dialog', dialog => dialog.dismiss());
    await userAPage.click('[data-testid="delete-account-btn"]');

    await expect(userAPage).toHaveURL(/\/app\/settings/, { timeout: 3_000 });
  });

  test('delete account: confirm acceptance deletes account and redirects to /auth', async ({ browser, api }) => {
    const user = await api.register();
    const ctx = await browser.newContext();
    await bootstrapAuthenticatedContext(ctx, user);
    const page = await ctx.newPage();

    await page.goto('/app/settings');
    await expect(page.locator('[data-testid="delete-account-btn"]')).toBeVisible({ timeout: 10_000 });

    page.on('dialog', dialog => dialog.accept());
    await page.click('[data-testid="delete-account-btn"]');

    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });

    // Verify the account is truly gone — login must return 401
    const loginCtx = await api.context();
    const res = await loginCtx.post('/api/auth/login', {
      data: { email: user.email, password: user.password, keepSignedIn: false },
    });
    expect(res.status()).toBe(401);
    await loginCtx.dispose();
    await ctx.close();
  });

  test('deleted account email and username can be re-registered immediately', async ({ api }) => {
    const user = await api.register();
    await api.deleteAccount(user.accessToken);

    // Same email, new username — must return 200, not 409 or 500
    const reregCtx = await api.context();
    const res = await reregCtx.post('/api/auth/register', {
      data: {
        email:       user.email,
        username:    `${user.username}_v2`,
        password:    user.password,
        keepSignedIn: false,
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    await reregCtx.dispose();
  });
});
