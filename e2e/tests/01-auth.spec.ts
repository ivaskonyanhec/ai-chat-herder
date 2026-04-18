import { test, expect } from '../fixtures/test-fixtures';
import { ApiHelpers } from '../helpers/api.helpers';

const api = new ApiHelpers();

test.describe('Authentication', () => {

  test('registration creates an account and allows immediate login', async ({ page }) => {
    const suffix   = `${Date.now()}`;
    const email    = `e2e-reg-${suffix}@test.local`;
    const password = 'Test@1234!E2E';
    const username = `reg_${suffix}`;

    await page.goto('/');
    await page.click('[data-testid="go-to-register"]');

    await page.fill('[data-testid="register-username"]', username);
    await page.fill('[data-testid="register-email"]',    email);
    await page.fill('[data-testid="register-password"]', password);
    await page.click('[data-testid="register-submit"]');

    // After registration the app logs in automatically and shows the main interface.
    await expect(page.locator('[data-testid="main-chat"]')).toBeVisible({ timeout: 8_000 });
  });

  test('login with valid credentials shows main chat', async ({ page }) => {
    const user = await api.register();

    await page.goto('/');
    await page.fill('[data-testid="login-email"]',    user.email);
    await page.fill('[data-testid="login-password"]', user.password);
    await page.click('[data-testid="login-submit"]');

    await expect(page.locator('[data-testid="main-chat"]')).toBeVisible({ timeout: 8_000 });
  });

  test('session persists after full page reload', async ({ userAPage }) => {
    // The fixture injects the access token into localStorage before navigation.
    // Angular should silently refresh using the refresh token and stay authenticated.
    await userAPage.goto('/');
    await expect(userAPage.locator('[data-testid="main-chat"]')).toBeVisible({ timeout: 8_000 });

    await userAPage.reload();
    await expect(userAPage.locator('[data-testid="main-chat"]')).toBeVisible({ timeout: 8_000 });
  });

  test('invalid credentials show an error and stay on login page', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="login-email"]',    'nobody@test.local');
    await page.fill('[data-testid="login-password"]', 'WrongPassword!1');
    await page.click('[data-testid="login-submit"]');

    await expect(page.locator('[data-testid="login-error"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="main-chat"]')).not.toBeVisible();
  });
});
