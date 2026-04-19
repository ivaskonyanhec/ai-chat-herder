import { test, expect } from '../../fixtures/test-fixtures';
import type { ApiHelpers } from '../../helpers/api.helpers';

async function becomeFriends(
  api: ApiHelpers,
  senderToken: string,
  receiverToken: string,
  receiverUsername: string,
  senderId: string,
): Promise<void> {
  await api.sendFriendRequest(senderToken, receiverUsername, 'UAT DM setup');
  const requests = await api.getFriendRequests(receiverToken);
  const request = requests.find(r => r.senderId === senderId);
  if (!request?.id) throw new Error('Friend request not found');
  await api.acceptFriendRequest(receiverToken, request.id);
}

test.describe('UAT: Direct messaging UX', () => {
  test('friends can exchange a DM through the browser UI and it persists in history', async ({
    userA,
    userB,
    userAPage,
    api,
  }) => {
    // Establish friendship and create dialog via API
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);

    // Navigate userA to the DM page and select the dialog
    await userAPage.goto(`/app/messages/${dialog.id}`);
    await expect(userAPage.locator(`[data-testid="dialog-item-${dialog.id}"]`)).toBeVisible({ timeout: 10_000 });
    await userAPage.click(`[data-testid="dialog-item-${dialog.id}"]`);
    await expect(userAPage.locator('[data-testid="dm-messages"]')).toBeVisible({ timeout: 5_000 });

    // userA types and sends a message via the browser UI
    const messageContent = `uat-dm-${Date.now()}`;
    await userAPage.fill('[data-testid="dm-message-input"]', messageContent);
    await userAPage.click('[data-testid="dm-send-btn"]');

    // Verify the message input clears (send success indicator)
    await expect(userAPage.locator('[data-testid="dm-message-input"]')).toHaveValue('', { timeout: 5_000 });

    // Verify the message persists in dialog history for the recipient
    const history = await api.getDialogMessages(userB.accessToken, dialog.id);
    expect(history.some(m => m.content === messageContent)).toBe(true);
  });

  test('frozen dialog (after block) is read-only in the browser UI', async ({
    userA,
    userB,
    userAPage,
    api,
  }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);

    // userB blocks userA → dialog becomes frozen
    await api.blockUser(userB.accessToken, userA.id);

    await userAPage.goto(`/app/messages/${dialog.id}`);
    await expect(userAPage.locator(`[data-testid="dialog-item-${dialog.id}"]`)).toBeVisible({ timeout: 10_000 });
    await userAPage.click(`[data-testid="dialog-item-${dialog.id}"]`);

    // The send button should be disabled because the dialog is frozen
    await expect(userAPage.locator('[data-testid="dm-send-btn"]')).toBeDisabled({ timeout: 5_000 });
  });
});
