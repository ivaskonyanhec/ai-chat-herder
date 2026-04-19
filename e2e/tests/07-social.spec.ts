import { test, expect } from '../fixtures/test-fixtures';
import type { ApiHelpers } from '../helpers/api.helpers';
import { createHubConnection } from '../helpers/signalr.helpers';

async function becomeFriends(api: ApiHelpers, senderToken: string, receiverToken: string, receiverUsername: string, senderId: string): Promise<void> {
  await api.sendFriendRequest(senderToken, receiverUsername, 'E2E connection request');
  const requests = await api.getFriendRequests(receiverToken);
  const request = requests.find(r => r.senderId === senderId);
  expect(request?.id).toBeTruthy();
  await api.acceptFriendRequest(receiverToken, request!.id);
}

test.describe('Friends, blocks, and direct messages', () => {
  test('friend request by username can be accepted and then removed through the API', async ({ api, userA, userB }) => {
    await api.sendFriendRequest(userA.accessToken, userB.username, 'Please connect for E2E.');

    const requests = await api.getFriendRequests(userB.accessToken);
    const request = requests.find(r => r.senderId === userA.id);
    expect(request).toEqual(
      expect.objectContaining({
        senderUsername: userA.username,
        receiverUsername: userB.username,
        status: 'Pending',
        message: 'Please connect for E2E.',
      }),
    );

    await api.acceptFriendRequest(userB.accessToken, request!.id);

    await expect.poll(async () => (await api.getFriends(userA.accessToken)).map(f => f.userId)).toContain(userB.id);
    await expect.poll(async () => (await api.getFriends(userB.accessToken)).map(f => f.userId)).toContain(userA.id);

    await api.removeFriend(userA.accessToken, userB.id);
    expect((await api.getFriends(userA.accessToken)).map(f => f.userId)).not.toContain(userB.id);
  });

  test('incoming friend request can be accepted from the live browser page', async ({ api, userA, userB, userBPage }) => {
    const note = `browser accept ${Date.now()}`;
    await api.sendFriendRequest(userA.accessToken, userB.username, note);

    await userBPage.goto('/app/requests');
    await expect(userBPage.getByText(userA.username)).toBeVisible({ timeout: 10_000 });
    await expect(userBPage.getByText(note)).toBeVisible();

    await userBPage.getByRole('button', { name: 'Accept' }).click();

    await expect(userBPage.getByText('No pending incoming requests.')).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await api.getFriends(userB.accessToken)).map(f => f.userId)).toContain(userA.id);
  });

  test('blocking a friend removes friendship, records the block, and freezes the existing dialog', async ({ api, userA, userB }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);

    await api.blockUser(userA.accessToken, userB.id);

    expect((await api.getFriends(userA.accessToken)).map(f => f.userId)).not.toContain(userB.id);
    expect(await api.getBlocks(userA.accessToken)).toContainEqual(
      expect.objectContaining({
        blockedUserId: userB.id,
        blockedUsername: userB.username,
      }),
    );
    expect((await api.getDialog(userA.accessToken, dialog.id)).isFrozen).toBe(true);

    const blockedCtx = await api.authContext(userB.accessToken);
    const blockedRequest = await blockedCtx.post('/api/friends/requests', {
      data: { username: userA.username, message: 'blocked retry' },
    });
    expect(blockedRequest.status()).toBe(403);
    await blockedCtx.dispose();
  });

  test('blocked users page lists blocks and can unblock a user', async ({ api, userA, userB, userAPage }) => {
    await api.blockUser(userA.accessToken, userB.id);

    await userAPage.goto('/app/blocks');
    await expect(userAPage.getByText(userB.username)).toBeVisible({ timeout: 10_000 });

    await userAPage.locator(`[data-testid="unblock-${userB.id}"]`).click();

    await expect(userAPage.getByText('No blocked users.')).toBeVisible({ timeout: 10_000 });
    expect((await api.getBlocks(userA.accessToken)).map(b => b.blockedUserId)).not.toContain(userB.id);
  });

  test('direct messages persist to dialog history and support author edit/delete endpoints', async ({ api, userA, userB }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const original = `dm-original-${Date.now()}`;
    const edited = `dm-edited-${Date.now()}`;

    await chat.invoke('SendDirectMessage', dialog.id, original, null, null);
    await chat.stop();

    const history = await api.getDialogMessages(userB.accessToken, dialog.id);
    const message = history.find(m => m.content === original);
    expect(message?.id).toBeTruthy();
    expect(message?.sender.id).toBe(userA.id);

    const editCtx = await api.authContext(userA.accessToken);
    const edit = await editCtx.patch(`/api/dm-messages/${message!.id}`, {
      data: { content: edited },
    });
    expect(edit.status(), await edit.text()).toBe(200);
    const editBody = await edit.json();
    expect(editBody.content).toBe(edited);
    expect(editBody.editedAt).toBeTruthy();

    const deletion = await editCtx.delete(`/api/dm-messages/${message!.id}`);
    expect(deletion.status(), await deletion.text()).toBe(204);
    await editCtx.dispose();

    const afterDelete = await api.getDialogMessages(userB.accessToken, dialog.id);
    expect(afterDelete).toContainEqual(
      expect.objectContaining({
        id: message!.id,
        content: null,
        isDeleted: true,
      }),
    );
  });
});
