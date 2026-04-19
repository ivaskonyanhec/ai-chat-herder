import { test, expect } from '../../fixtures/test-fixtures';

function expiredJwt(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }))
    .toString('base64url');
  return `e2e.${payload}.expired`;
}

test.describe('UAT: Create Room via sidebar button', () => {
  test('Create Room button opens form, submitting navigates to the new room', async ({ userAPage }) => {
    const roomName = `uat-room-${Date.now()}`;

    await userAPage.goto('/app/rooms');

    // Button should be visible and the form should not be open yet
    await expect(userAPage.locator('[data-testid="create-room"]')).toBeVisible({ timeout: 10_000 });
    await expect(userAPage.locator('[data-testid="create-room-form"]')).not.toBeVisible();

    // Open the create-room form
    await userAPage.click('[data-testid="create-room"]');
    await expect(userAPage.locator('[data-testid="create-room-form"]')).toBeVisible({ timeout: 3_000 });

    // Fill in the room name
    await userAPage.fill('[data-testid="create-room-name"]', roomName);

    // Submit
    await userAPage.click('[data-testid="create-room-submit"]');

    // Should navigate to /app/rooms/<new-id>
    await expect(userAPage).toHaveURL(/\/app\/rooms\/[a-f0-9-]+/, { timeout: 10_000 });

    // The new room should appear in the sidebar list (scope to public-rooms-section to avoid matching the <h1> heading)
    await expect(userAPage.locator('[data-testid="public-rooms-section"]').getByText(`#${roomName}`)).toBeVisible({ timeout: 5_000 });

    // The form should be dismissed
    await expect(userAPage.locator('[data-testid="create-room-form"]')).not.toBeVisible();
  });

  test('Cancel button dismisses the create-room form without creating a room', async ({ userAPage }) => {
    await userAPage.goto('/app/rooms');
    await expect(userAPage.locator('[data-testid="create-room"]')).toBeVisible({ timeout: 10_000 });

    await userAPage.click('[data-testid="create-room"]');
    await expect(userAPage.locator('[data-testid="create-room-form"]')).toBeVisible({ timeout: 3_000 });

    await userAPage.fill('[data-testid="create-room-name"]', 'should-not-exist');
    await userAPage.click('[data-testid="create-room-cancel"]');

    await expect(userAPage.locator('[data-testid="create-room-form"]')).not.toBeVisible();
    // URL unchanged — no navigation occurred
    await expect(userAPage).toHaveURL(/\/app\/rooms$/, { timeout: 2_000 });
  });

  test('Expired access token is refreshed before creating a room', async ({ browser, userA }) => {
    const context = await browser.newContext();
    const token = expiredJwt();
    await context.addCookies([
      {
        name: 'chat_herder_refresh',
        value: userA.refreshToken,
        url: `${process.env.BASE_URL ?? 'http://localhost'}/api/auth/refresh`,
        httpOnly: true,
        sameSite: 'Lax',
        secure: false,
        expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      },
    ]);
    await context.addInitScript(
      ({ accessToken, user }) => {
        window.localStorage.setItem('access_token', accessToken);
        window.localStorage.setItem(
          'chat-herder.session.persistent',
          JSON.stringify({
            accessToken,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              avatarUrl: null,
            },
          }),
        );
      },
      {
        accessToken: token,
        user: {
          id: userA.id,
          username: userA.username,
          email: userA.email,
        },
      },
    );
    const page = await context.newPage();
    const roomName = `uat-refresh-room-${Date.now()}`;

    const refreshResponse = page.waitForResponse(response =>
      response.url().endsWith('/api/auth/refresh') && response.status() === 200,
    );
    await page.goto('/app/rooms');
    await refreshResponse;

    await page.click('[data-testid="create-room"]');
    await page.fill('[data-testid="create-room-name"]', roomName);
    await page.click('[data-testid="create-room-submit"]');

    await expect(page).toHaveURL(/\/app\/rooms\/[a-f0-9-]+/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: `#${roomName}` })).toBeVisible({ timeout: 5_000 });

    await context.close();
  });
});
