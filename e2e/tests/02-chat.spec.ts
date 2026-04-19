import { test, expect } from '../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../helpers/room.helpers';
import { createHubConnection } from '../helpers/signalr.helpers';

test.describe('Room chat', () => {
  test('user can open a room in the browser and see the chat surface', async ({ userAPage, userA, api }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });

    await userAPage.goto(`/app/rooms/${room.id}`);

    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 10_000 });
    await expect(userAPage.locator('[data-testid="message-input"]')).toBeVisible();
  });

  test('room messages support multiline text and emoji and remain available via history refetch', async ({
    userA,
    userB,
    api,
  }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const message = `hello room\nsecond line ${String.fromCodePoint(0x1f680)}`;

    await chat.invoke('SendMessage', room.id, message, null, null);
    await chat.stop();

    const ctx = await api.authContext(userB.accessToken);
    const history = await ctx.get(`/api/rooms/${room.id}/messages`);
    expect(history.status(), await history.text()).toBe(200);
    const messages = await history.json();
    expect(messages.some((m: { content: string | null }) => m.content === message)).toBe(true);
    await ctx.dispose();
  });

  test('message size limit rejects content larger than 3 KB', async ({ userA, api }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const oversized = 'x'.repeat(3_073);

    await expect(chat.invoke('SendMessage', room.id, oversized, null, null)).rejects.toThrow();
    await chat.stop();
  });

  test('room history can be fetched in chronological order with afterSeq', async ({ userA, userB, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const first = `first-${Date.now()}`;
    const second = `second-${Date.now()}`;

    await chat.invoke('SendMessage', room.id, first, null, null);
    await chat.invoke('SendMessage', room.id, second, null, null);
    await chat.stop();

    const ctx = await api.authContext(userB.accessToken);
    const history = await ctx.get(`/api/rooms/${room.id}/messages?afterSeq=0`);
    expect(history.status(), await history.text()).toBe(200);
    const messages = await history.json();
    const contents = messages.map((m: { content: string | null }) => m.content);
    expect(contents.indexOf(first)).toBeGreaterThanOrEqual(0);
    expect(contents.indexOf(second)).toBeGreaterThan(contents.indexOf(first));
    await ctx.dispose();
  });

  test('message author can edit their own message and edited timestamp is returned', async ({ userA, api }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const original = `before-edit-${Date.now()}`;
    const edited = `after-edit-${Date.now()}`;

    await chat.invoke('SendMessage', room.id, original, null, null);
    await chat.stop();

    const ctx = await api.authContext(userA.accessToken);
    const history = await ctx.get(`/api/rooms/${room.id}/messages`);
    expect(history.status(), await history.text()).toBe(200);
    const messages = await history.json();
    const message = messages.find((m: { content: string | null }) => m.content === original);
    expect(message?.id).toBeTruthy();

    const edit = await ctx.patch(`/api/messages/${message.id}`, {
      data: { content: edited },
    });
    expect(edit.status(), await edit.text()).toBe(200);
    const editBody = await edit.json();
    expect(editBody.content).toBe(edited);
    expect(editBody.editedAt).toBeTruthy();
    await ctx.dispose();
  });

  test('non-author cannot edit another user message', async ({ userA, userB, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const original = `not-yours-${Date.now()}`;

    await chat.invoke('SendMessage', room.id, original, null, null);
    await chat.stop();

    const ownerCtx = await api.authContext(userA.accessToken);
    const history = await ownerCtx.get(`/api/rooms/${room.id}/messages`);
    const messages = await history.json();
    const message = messages.find((m: { content: string | null }) => m.content === original);
    await ownerCtx.dispose();

    const otherCtx = await api.authContext(userB.accessToken);
    const edit = await otherCtx.patch(`/api/messages/${message.id}`, {
      data: { content: 'hijack attempt' },
    });
    expect(edit.status()).toBe(403);
    await otherCtx.dispose();
  });

  test('message author can delete their own message', async ({ userA, api }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `delete-me-${Date.now()}`;

    await chat.invoke('SendMessage', room.id, content, null, null);
    await chat.stop();

    const ctx = await api.authContext(userA.accessToken);
    const history = await ctx.get(`/api/rooms/${room.id}/messages`);
    const messages = await history.json();
    const message = messages.find((m: { content: string | null }) => m.content === content);
    const deletion = await ctx.delete(`/api/messages/${message.id}`);
    expect(deletion.status()).toBe(204);

    const afterDelete = await ctx.get(`/api/rooms/${room.id}/messages`);
    const remaining = await afterDelete.json();
    const deletedMsg = remaining.find((m: { id: string }) => m.id === message.id);
    expect(deletedMsg).toMatchObject({ isDeleted: true, content: null });
    await ctx.dispose();
  });

  test('user B receives a room message in the browser within 3 seconds', async ({ userA, userB, userBPage, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const message = `realtime-recv-${Date.now()}`;

    await userBPage.goto(`/app/rooms/${room.id}`);
    await expect(userBPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 10_000 });

    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    await chat.invoke('SendMessage', room.id, message, null, null);
    await chat.stop();

    await expect(
      userBPage.locator('[data-testid="chat-area"] [data-testid="message-text"]').filter({ hasText: message }),
    ).toBeVisible({ timeout: 3_000 });
  });

  test('sender sees their own message immediately in the browser', async ({ userA, userAPage, api }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    const message = `self-send-${Date.now()}`;

    await userAPage.goto(`/app/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 10_000 });

    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    await chat.invoke('SendMessage', room.id, message, null, null);
    await chat.stop();

    await expect(
      userAPage.locator('[data-testid="chat-area"] [data-testid="message-text"]').filter({ hasText: message }),
    ).toBeVisible({ timeout: 3_000 });
  });

  test.skip('reply/reference flow shows quoted message UI', async () => {
    // BLOCKED: no browser-visible reply controls or reply quote test IDs are wired yet.
  });
});
