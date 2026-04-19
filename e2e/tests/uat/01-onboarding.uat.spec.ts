import { test, expect } from '../../fixtures/test-fixtures';
import { uniqueIdentity } from '../../helpers/auth.helpers';

test.describe('UAT: Onboarding and identity', () => {
  test('new user can register, sign in, and delete account through supported paths', async ({ page, api }) => {
    const identity = uniqueIdentity('uat_ob');

    await page.goto('/auth');
    await page.click('[data-testid="go-to-register"]');
    await page.fill('[data-testid="register-username"]', identity.username);
    await page.fill('[data-testid="register-email"]', identity.email);
    await page.fill('[data-testid="register-password"]', identity.password);
    await page.click('[data-testid="register-submit"]');
    await expect(page.locator('[data-testid="main-chat"]')).toBeVisible({ timeout: 10_000 });

    const user = await api.login(identity.email, identity.password);
    const ctx = await api.authContext(user.accessToken);
    const deletion = await ctx.delete('/api/auth/account');
    expect(deletion.status()).toBe(204);
    await ctx.dispose();
  });

  test('username cannot be changed through profile UI', async ({ userAPage }) => {
    await userAPage.goto('/app/profile');
    // Profile settings renders a statically disabled input for the username field
    const usernameInput = userAPage.locator('input[disabled]').first();
    await expect(usernameInput).toBeVisible({ timeout: 10_000 });
    await expect(usernameInput).toBeDisabled();
  });
});
