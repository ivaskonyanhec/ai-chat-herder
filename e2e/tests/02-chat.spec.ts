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

  test.skip('user B receives a room message in the browser within 3 seconds', async () => {
    // BLOCKED: ChatHub has no JoinRoom method and the current room UI does not bind ChatService events
    // into visible message rows. Backend persistence is covered above; browser-visible SignalR delivery is not.
  });

  test.skip('sender sees their own message immediately in the browser', async () => {
    // BLOCKED: current room chat template is static and does not append sent messages.
  });

  test.skip('reply/reference flow shows quoted message UI', async () => {
    // BLOCKED: no browser-visible reply controls are wired to ChatService yet.
  });
});
