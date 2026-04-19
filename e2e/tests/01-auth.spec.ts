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

  test('password change keeps current session and revokes other active sessions', async ({ api }) => {
    const user = await api.register();
    const secondSession = await api.login(user.email, user.password);
    const currentCtx = await api.authContext(user.accessToken);
    const otherCtx = await api.authContext(secondSession.accessToken);

    const change = await currentCtx.post('/api/auth/change-password', {
      data: {
        currentPassword: user.password,
        newPassword: 'Changed@1234!E2E',
      },
    });
    expect(change.status(), await change.text()).toBe(200);

    expect((await currentCtx.get('/api/rooms/my')).status()).toBe(200);
    expect((await otherCtx.get('/api/rooms/my')).status()).toBe(401);

    await currentCtx.dispose();
    await otherCtx.dispose();
  });

  test('username remains immutable through the profile API', async ({ api, userA }) => {
    const ctx = await api.authContext(userA.accessToken);
    const patch = await ctx.patch('/api/users/me', {
      data: {
        username: `${userA.username}_changed`,
        avatarUrl: 'https://example.test/avatar.png',
      },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    const body = await patch.json();
    expect(body.username).toBe(userA.username);
    expect(body.avatarUrl).toBe('https://example.test/avatar.png');
    await ctx.dispose();
  });

  test('delete account deletes rooms owned by the deleted user', async ({ api }) => {
    const owner = await api.register();
    const member = await api.register();
    const room = await api.createRoom(owner.accessToken, { visibility: 'Public' });
    await api.joinPublicRoom(room.id, member.accessToken);

    const ownerCtx = await api.authContext(owner.accessToken);
    expect((await ownerCtx.delete('/api/auth/account')).status()).toBe(204);
    await ownerCtx.dispose();

    // After owner account is deleted, the JWT is revoked — use a different user to verify the room is gone
    const memberCtx = await api.authContext(member.accessToken);
    expect((await memberCtx.get(`/api/rooms/${room.id}`)).status()).toBe(404);
    await memberCtx.dispose();
  });

  test('delete account removes the deleted user from memberships in other rooms', async ({ api }) => {
    const owner = await api.register();
    const member = await api.register();
    const room = await api.createRoom(owner.accessToken, { visibility: 'Public' });
    await api.joinPublicRoom(room.id, member.accessToken);

    const memberCtx = await api.authContext(member.accessToken);
    expect((await memberCtx.delete('/api/auth/account')).status()).toBe(204);
    await memberCtx.dispose();

    const members = await api.getMembers(room.id, owner.accessToken);
    expect(members.map((m) => m.userId)).not.toContain(member.id);
  });

  test('active sessions can be viewed and selectively revoked through the UI', async ({ userAPage, userA, api }) => {
    const secondSession = await api.login(userA.email, userA.password);
    const sessionsCtx = await api.authContext(userA.accessToken);
    const sessionsResponse = await sessionsCtx.get('/api/sessions');
    expect(sessionsResponse.status(), await sessionsResponse.text()).toBe(200);
    const sessions = await sessionsResponse.json();
    const otherSession = sessions.find((session: { id: string; isCurrent: boolean }) => !session.isCurrent);
    expect(otherSession?.id).toBeTruthy();

    await userAPage.goto('/app/sessions');
    await expect(userAPage.locator('[data-testid="sessions-title"]')).toBeVisible({ timeout: 10_000 });
    const sessionRow = userAPage.locator(`[data-testid="session-row-${otherSession.id}"]`);
    await expect(sessionRow).toBeVisible({ timeout: 10_000 });

    await userAPage.locator(`[data-testid="revoke-session-${otherSession.id}"]`).click();
    await expect(sessionRow).not.toBeVisible({ timeout: 10_000 });

    const revokedCtx = await api.authContext(secondSession.accessToken);
    expect((await revokedCtx.get('/api/rooms/my')).status()).toBe(401);

    await revokedCtx.dispose();
    await sessionsCtx.dispose();
  });
});
