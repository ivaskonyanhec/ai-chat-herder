// e2e/tests/12-avatar-icons.spec.ts
import { test, expect } from '../fixtures/test-fixtures';

test.describe('Avatar icons & sidebar hide', () => {
  test('user can select a predefined icon and it appears as navbar avatar', async ({
    userA,
    userAPage,
    api,
  }) => {
    await userAPage.goto('/app/settings');
    await expect(userAPage.locator('[data-testid="avatar-icon-picker-btn"]')).toBeVisible({ timeout: 5_000 });
    await userAPage.click('[data-testid="avatar-icon-picker-btn"]');

    await expect(userAPage.locator('[data-testid="icon-picker"]')).toBeVisible({ timeout: 3_000 });
    await userAPage.click('[data-testid="icon-option-star"]');

    // Picker closes after selection
    await expect(userAPage.locator('[data-testid="icon-picker"]')).toBeHidden({ timeout: 5_000 });

    // Navigate away (SPA navigation — session state preserved in memory)
    await userAPage.goto('/app/rooms');
    await expect(userAPage.locator('[data-testid="navbar-avatar"]')).toBeVisible({ timeout: 5_000 });

    // The avatar should render a Material Symbol span (icon mode), not a broken img
    const avatarEl = userAPage.locator('[data-testid="navbar-avatar"] [data-testid="avatar-icon"]');
    await expect(avatarEl).toBeVisible({ timeout: 5_000 });
    await expect(avatarEl).toHaveText('star');
  });

  test('icon selection persists to the backend', async ({ userA, api }) => {
    const ctx = await api.authContext(userA.accessToken);
    const res = await ctx.patch('/api/users/me', { data: { avatarUrl: 'icon:rocket_launch' } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.avatarUrl).toBe('icon:rocket_launch');
    await ctx.dispose();
  });

  test('hiding a room removes it from the sidebar and reset restores it', async ({
    userA,
    userAPage,
    api,
  }) => {
    // Create a room — creator is automatically a member
    const room = await api.createRoom(userA.accessToken, { name: `hide-test-${Date.now()}`, visibility: 'Public' });

    await userAPage.goto('/app/rooms');
    // Wait for the sidebar to show the room
    await expect(userAPage.locator(`[data-testid="public-room-${room.id}"]`)).toBeVisible({ timeout: 10_000 });

    // Hover the room item to reveal the hide button (uses CSS group-hover)
    await userAPage.hover(`[data-testid="public-room-${room.id}"]`);
    await expect(userAPage.locator(`[data-testid="hide-room-${room.id}"]`)).toBeVisible({ timeout: 2_000 });
    await userAPage.click(`[data-testid="hide-room-${room.id}"]`);

    // Room disappears from the sidebar
    await expect(userAPage.locator(`[data-testid="public-room-${room.id}"]`)).toBeHidden({ timeout: 3_000 });

    // "Show N hidden" button appears
    await expect(userAPage.locator('[data-testid="reset-hidden-items"]')).toBeVisible({ timeout: 2_000 });

    // Click it to restore
    await userAPage.click('[data-testid="reset-hidden-items"]');
    await expect(userAPage.locator(`[data-testid="public-room-${room.id}"]`)).toBeVisible({ timeout: 3_000 });
  });
});
