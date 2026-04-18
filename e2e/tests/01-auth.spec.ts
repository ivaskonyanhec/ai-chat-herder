import { test, expect, request } from '../fixtures/test-fixtures';
import { uniqueIdentity } from '../helpers/auth.helpers';

test.describe('Authentication', () => {
  test('registration with email, password, and unique username creates an authenticated session', async ({ page }) => {
    const user = uniqueIdentity('reg');

    await page.goto('/auth');
    await page.click('[data-testid="go-to-register"]');
    await page.fill('[data-testid="register-username"]', user.username);
    await page.fill('[data-testid="register-email"]', user.email);
    await page.fill('[data-testid="register-password"]', user.password);
    await page.click('[data-testid="register-submit"]');

    await expect(page.locator('[data-testid="main-chat"]')).toBeVisible({ timeout: 10_000 });
  });

  test('duplicate email and duplicate username are rejected by registration rules', async ({ api }) => {
    const user = await api.register();
    const ctx = await api.context();

    const duplicateEmail = await ctx.post('/api/auth/register', {
      data: {
        email: user.email,
        password: 'Test@1234!E2E',
        username: `${user.username}_new`,
        keepSignedIn: true,
      },
    });
    expect(duplicateEmail.status()).toBe(409);

    const duplicateUsername = await ctx.post('/api/auth/register', {
      data: {
        email: `new-${user.email}`,
        password: 'Test@1234!E2E',
        username: user.username,
        keepSignedIn: true,
      },
    });
    expect(duplicateUsername.status()).toBe(409);
    await ctx.dispose();
  });

  test('login with valid credentials shows the main chat shell', async ({ page, api }) => {
    const user = await api.register();

    await page.goto('/auth');
    await page.fill('[data-testid="login-email"]', user.email);
    await page.fill('[data-testid="login-password"]', user.password);
    await page.click('[data-testid="login-submit"]');

    await expect(page.locator('[data-testid="main-chat"]')).toBeVisible({ timeout: 10_000 });
  });

  test('invalid login shows an error and does not enter the chat shell', async ({ page }) => {
    await page.goto('/auth');
    await page.fill('[data-testid="login-email"]', 'nobody@test.local');
    await page.fill('[data-testid="login-password"]', 'WrongPassword!1');
    await page.click('[data-testid="login-submit"]');

    await expect(page.locator('[data-testid="login-error"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="main-chat"]')).not.toBeVisible();
  });

  test('persistent session survives a new browser context', async ({ browser, userA }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(
      ({ token, user }) => {
        window.localStorage.setItem('access_token', token);
        window.localStorage.setItem(
          'chat-herder.session.persistent',
          JSON.stringify({ accessToken: token, user }),
        );
      },
      {
        token: userA.accessToken,
        user: {
          id: userA.id,
          username: userA.username,
          email: userA.email,
          avatarUrl: null,
        },
      },
    );

    const page = await ctx.newPage();
    await page.goto('/app');
    await expect(page.locator('[data-testid="main-chat"]')).toBeVisible({ timeout: 10_000 });
    await ctx.close();
  });

  test('sign out invalidates only the current browser session', async ({ page, api }) => {
    const user = await api.register();
    const secondSession = await api.login(user.email, user.password);
    const firstCtx = await request.newContext({
      baseURL: api.baseUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${user.accessToken}` },
    });
    const secondCtx = await request.newContext({
      baseURL: api.baseUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${secondSession.accessToken}` },
    });

    const logout = await firstCtx.post('/api/auth/logout');
    expect(logout.status()).toBe(204);
    expect((await firstCtx.get('/api/rooms/my')).status()).toBe(401);
    expect((await secondCtx.get('/api/rooms/my')).status()).toBe(200);

    await firstCtx.dispose();
    await secondCtx.dispose();

    await page.goto('/auth');
    await page.fill('[data-testid="login-email"]', user.email);
    await page.fill('[data-testid="login-password"]', user.password);
    await page.click('[data-testid="login-submit"]');
    await expect(page.locator('[data-testid="main-chat"]')).toBeVisible({ timeout: 10_000 });
  });

  test('delete account endpoint removes authentication for the deleted user', async ({ api }) => {
    const user = await api.register();
    const ctx = await api.authContext(user.accessToken);
    const deletion = await ctx.delete('/api/auth/account');
    expect(deletion.status()).toBe(204);
    expect((await ctx.get('/api/rooms/my')).status()).toBe(401);
    await ctx.dispose();
  });

  test.skip('username cannot be changed through the UI', async () => {
    // BLOCKED: profile settings page is currently static and exposes no username update control.
  });

  test.skip('active sessions can be viewed and selectively revoked through the UI', async () => {
    // BLOCKED: sessions UI exists, but E2E selectors for stable multi-session rows depend on live API wiring.
  });
});
