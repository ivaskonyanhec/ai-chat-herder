import { test, expect } from '../fixtures/test-fixtures';
import type { ApiHelpers } from '../helpers/api.helpers';
import { createPublicRoomWithMembers } from '../helpers/room.helpers';
import { createHubConnection } from '../helpers/signalr.helpers';

async function becomeFriends(
  api: ApiHelpers,
  senderToken: string,
  receiverToken: string,
  receiverUsername: string,
  senderId: string,
): Promise<void> {
  await api.sendFriendRequest(senderToken, receiverUsername, 'notification setup');
  const requests = await api.getFriendRequests(receiverToken);
  const request = requests.find(r => r.senderId === senderId);
  expect(request?.id).toBeTruthy();
  await api.acceptFriendRequest(receiverToken, request!.id);
}

test.describe('Unread notifications', () => {
  test('room unread count increments for recipients and clears when marked read', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);

    await chat.invoke('SendMessage', room.id, `room-unread-${Date.now()}`, null, null);
    await chat.stop();

    await expect.poll(() => api.getUnreadCount(userB.accessToken, 'room', room.id)).toBe(1);

    await api.markRoomRead(userB.accessToken, room.id);
    await expect.poll(() => api.getUnreadCount(userB.accessToken, 'room', room.id)).toBe(0);
  });

  test('room unread badge appears in the sidebar without a page refresh', async ({ api, userA, userB, userBPage }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);

    await userBPage.goto('/app/rooms');
    await expect(userBPage.locator(`[data-testid="public-room-${room.id}"]`)).toBeVisible({ timeout: 10_000 });
    await expect(userBPage.locator(`[data-testid="unread-badge-${room.id}"]`)).toHaveCount(0);

    await chat.invoke('SendMessage', room.id, `room-live-unread-${Date.now()}`, null, null);
    await chat.stop();

    await expect(userBPage.locator(`[data-testid="unread-badge-${room.id}"]`)).toHaveText('1', { timeout: 5_000 });
  });

  test('dialog unread count increments for recipient and clears when marked read', async ({ api, userA, userB }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);

    await chat.invoke('SendDirectMessage', dialog.id, `dialog-unread-${Date.now()}`, null, null);
    await chat.stop();

    await expect.poll(() => api.getUnreadCount(userB.accessToken, 'dialog', dialog.id)).toBe(1);

    await api.markDialogRead(userB.accessToken, dialog.id);
    await expect.poll(() => api.getUnreadCount(userB.accessToken, 'dialog', dialog.id)).toBe(0);
  });
});
