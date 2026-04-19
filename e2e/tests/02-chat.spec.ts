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

  test('browser room history shows earliest messages at the top', async ({ userA, userAPage, api }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const first = `browser-first-${suffix}`;
    const second = `browser-second-${suffix}`;
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);

    await chat.invoke('SendMessage', room.id, first, null, null);
    await chat.invoke('SendMessage', room.id, second, null, null);
    await chat.stop();

    await userAPage.goto(`/app/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="message-text"]').filter({ hasText: first }))
      .toBeVisible({ timeout: 10_000 });
    await expect(userAPage.locator('[data-testid="message-text"]').filter({ hasText: second }))
      .toBeVisible({ timeout: 10_000 });

    const contents = (await userAPage.locator('[data-testid="message-text"]').allTextContents())
      .map(text => text.trim());
    expect(contents.indexOf(first)).toBeGreaterThanOrEqual(0);
    expect(contents.indexOf(second)).toBeGreaterThan(contents.indexOf(first));
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

  test('sidebar room selection reloads the reused chat component for the selected room', async ({ userA, userAPage, api }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const firstRoom = await api.createRoom(userA.accessToken, {
      name: `switch-first-${suffix}`,
      visibility: 'Public',
    });
    const secondRoom = await api.createRoom(userA.accessToken, {
      name: `switch-second-${suffix}`,
      visibility: 'Public',
    });
    const firstMessage = `first-room-message-${suffix}`;
    const secondMessage = `second-room-message-${suffix}`;
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    await chat.invoke('SendMessage', firstRoom.id, firstMessage, null, null);
    await chat.invoke('SendMessage', secondRoom.id, secondMessage, null, null);
    await chat.stop();

    await userAPage.goto(`/app/rooms/${firstRoom.id}`);
    await expect(userAPage.locator('[data-testid="chat-area"] [data-testid="message-text"]').filter({ hasText: firstMessage }))
      .toBeVisible({ timeout: 10_000 });

    await userAPage.locator('[data-testid="public-rooms-section"] a', { hasText: secondRoom.name }).click();

    await expect(userAPage).toHaveURL(new RegExp(`/app/rooms/${secondRoom.id}$`));
    await expect(userAPage.locator('[data-testid="chat-area"] [data-testid="message-text"]').filter({ hasText: secondMessage }))
      .toBeVisible({ timeout: 10_000 });
    await expect(userAPage.locator('[data-testid="chat-area"] [data-testid="message-text"]').filter({ hasText: firstMessage }))
      .toHaveCount(0);
  });

  test('Slack-style composer supports Shift+Enter newline and Enter send', async ({ userA, userAPage, api }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    const messagePrefix = `composer-${Date.now()}`;
    const expectedMessage = `${messagePrefix}\nsecond line`;

    await userAPage.goto(`/app/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="message-composer"]')).toBeVisible({ timeout: 10_000 });
    await expect(userAPage.locator('[data-testid="send-message-btn"]')).toBeDisabled();

    await userAPage.locator('[data-testid="message-input"]').fill(messagePrefix);
    await expect(userAPage.locator('[data-testid="send-message-btn"]')).toBeEnabled();
    await userAPage.locator('[data-testid="message-input"]').press('Shift+Enter');
    await userAPage.locator('[data-testid="message-input"]').pressSequentially('second line');
    await expect(userAPage.locator('[data-testid="message-input"]')).toHaveJSProperty('innerText', expectedMessage);

    await userAPage.locator('[data-testid="message-input"]').press('Enter');

    await expect(userAPage.locator('[data-testid="message-input"]')).toHaveJSProperty('innerText', '', { timeout: 5_000 });
    await expect(userAPage.locator('[data-testid="chat-area"] [data-testid="message-text"]').filter({ hasText: expectedMessage }))
      .toBeVisible({ timeout: 5_000 });
  });

  test('Slack-style composer inserts and sends an emoji from the picker', async ({ userA, userAPage, api }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    const prefix = `emoji-${Date.now()} `;
    const expectedMessage = `${prefix}😀`;

    await userAPage.goto(`/app/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="message-composer"]')).toBeVisible({ timeout: 10_000 });

    await userAPage.locator('[data-testid="message-input"]').fill(prefix);
    await userAPage.locator('[data-testid="emoji-picker-btn"]').click();
    await expect(userAPage.locator('[data-testid="emoji-picker"]')).toBeVisible();
    await userAPage.locator('[data-testid="emoji-option-0"]').click();

    await expect(userAPage.locator('[data-testid="message-input"]')).toHaveJSProperty('innerText', expectedMessage);
    await userAPage.locator('[data-testid="send-message-btn"]').click();

    await expect(userAPage.locator('[data-testid="message-input"]')).toHaveJSProperty('innerText', '', { timeout: 5_000 });
    await expect(userAPage.locator('[data-testid="chat-area"] [data-testid="message-text"]').filter({ hasText: expectedMessage }))
      .toBeVisible({ timeout: 5_000 });
  });

  test('browser UI aligns own messages right and other messages left', async ({ userA, userB, userAPage, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const ownMessage = `own-align-${suffix}`;
    const otherMessage = `other-align-${suffix}`;

    await userAPage.goto(`/app/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="message-input"]')).toBeVisible({ timeout: 10_000 });

    await userAPage.locator('[data-testid="message-input"]').fill(ownMessage);
    await userAPage.locator('[data-testid="send-message-btn"]').click();

    const chat = await createHubConnection('/hubs/chat', userB.accessToken);
    await chat.invoke('SendMessage', room.id, otherMessage, null, null);
    await chat.stop();

    const ownWrapper = userAPage
      .locator('[data-testid="message-text"]')
      .filter({ hasText: ownMessage })
      .locator('xpath=ancestor::*[starts-with(@data-testid, "message-")][1]');
    const otherWrapper = userAPage
      .locator('[data-testid="message-text"]')
      .filter({ hasText: otherMessage })
      .locator('xpath=ancestor::*[starts-with(@data-testid, "message-")][1]');

    await expect(ownWrapper).toHaveClass(/justify-end/, { timeout: 5_000 });
    await expect(otherWrapper).toHaveClass(/justify-start/, { timeout: 5_000 });
  });

  test('reply/reference flow shows quoted message UI', async ({ userA, userB, userAPage, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const originalContent = `original-${Date.now()}`;
    const replyContent = `reply-${Date.now()}`;

    const chatB = await createHubConnection('/hubs/chat', userB.accessToken);
    await chatB.invoke('SendMessage', room.id, originalContent, null, null);

    const ctx = await api.authContext(userA.accessToken);
    const msgs: Array<{ id: string; content: string }> = await (await ctx.get(`/api/rooms/${room.id}/messages`)).json();
    const original = msgs.find(m => m.content === originalContent);
    if (!original) throw new Error('Original message not in history');

    // userA opens room; userB sends reply in real-time
    await userAPage.goto(`/app/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 10_000 });

    await chatB.invoke('SendMessage', room.id, replyContent, original.id, null);
    await chatB.stop();
    await ctx.dispose();

    await expect(userAPage.locator('[data-testid="reply-quote"]')).toBeVisible({ timeout: 5_000 });
  });
});
