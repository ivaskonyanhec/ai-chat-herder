import { test, expect } from '../../fixtures/test-fixtures';

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

    // The new room should appear in the sidebar list
    await expect(userAPage.getByText(`#${roomName}`)).toBeVisible({ timeout: 5_000 });

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
});
