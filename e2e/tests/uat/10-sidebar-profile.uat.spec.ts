// e2e/tests/uat/10-sidebar-profile.uat.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';
import { becomeFriends } from '../../helpers/friends.helpers';

test.describe('UAT: Sidebar hide and icon avatar', () => {
  test('user sees initials in collapsed sidebar for rooms', async ({
    userA,
    userAPage,
    api,
  }) => {
    const room = await api.createRoom(userA.accessToken, { name: `uat-room-${Date.now()}`, visibility: 'Public' });
    await api.joinRoom(userA.accessToken, room.id);

    await userAPage.goto('/app/rooms');
    await expect(userAPage.locator('[data-testid="sidebar-toggle"]')).toBeVisible({ timeout: 5_000 });

    // Collapse sidebar
    await userAPage.click('[data-testid="sidebar-toggle"]');

    // Room appears as initials circle in collapsed sidebar
    const roomItem = userAPage.locator(`[data-testid="public-room-${room.id}"]`);
    await expect(roomItem).toBeVisible({ timeout: 5_000 });
    // The item should NOT contain a generic material-symbol "public" icon — it should show avatar-initials
    const initialsEl = roomItem.locator('[data-testid="avatar-initials"]');
    await expect(initialsEl).toBeVisible({ timeout: 3_000 });
  });

  test('user can hide a contact from the sidebar and restore via reset', async ({
    userA,
    userB,
    userAPage,
    api,
  }) => {
    // Become friends so userB appears in sidebar contacts
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);

    await userAPage.goto('/app/rooms');
    await expect(userAPage.locator(`[data-testid="contact-${userB.username}"]`)).toBeVisible({ timeout: 8_000 });

    // Hover to reveal hide button
    await userAPage.hover(`[data-testid="contact-${userB.username}"]`);
    await expect(userAPage.locator(`[data-testid="hide-contact-${userB.username}"]`)).toBeVisible({ timeout: 2_000 });
    await userAPage.click(`[data-testid="hide-contact-${userB.username}"]`);

    await expect(userAPage.locator(`[data-testid="contact-${userB.username}"]`)).toBeHidden({ timeout: 3_000 });

    // Reset button restores them
    await userAPage.click('[data-testid="reset-hidden-items"]');
    await expect(userAPage.locator(`[data-testid="contact-${userB.username}"]`)).toBeVisible({ timeout: 3_000 });
  });

  test('user selects icon avatar in profile settings, it updates the navbar immediately', async ({
    userA,
    userAPage,
  }) => {
    await userAPage.goto('/app/settings');

    // Open the icon picker
    await expect(userAPage.locator('[data-testid="avatar-icon-picker-btn"]')).toBeVisible({ timeout: 5_000 });
    await userAPage.click('[data-testid="avatar-icon-picker-btn"]');
    await expect(userAPage.locator('[data-testid="icon-picker"]')).toBeVisible({ timeout: 3_000 });

    // Select "favorite"
    await userAPage.click('[data-testid="icon-option-favorite"]');

    // Picker closes
    await expect(userAPage.locator('[data-testid="icon-picker"]')).toBeHidden({ timeout: 5_000 });

    // Profile avatar shows the icon
    await expect(userAPage.locator('[data-testid="profile-avatar"] [data-testid="avatar-icon"]'))
      .toHaveText('favorite', { timeout: 5_000 });

    // Navigate to a room page — navbar avatar should still show icon (not broken img)
    await userAPage.goto('/app/rooms');
    await expect(userAPage.locator('[data-testid="navbar-avatar"] [data-testid="avatar-icon"]'))
      .toHaveText('favorite', { timeout: 5_000 });
  });
});
