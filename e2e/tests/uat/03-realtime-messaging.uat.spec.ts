import { test, expect } from '../../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../../helpers/room.helpers';
import { createHubConnection } from '../../helpers/signalr.helpers';

test.describe('UAT: Real-time messaging UX', () => {
  test('user sends a message that is persisted and visible through history refetch', async ({ userA, userB, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const message = `uat message ${Date.now()}`;

    await chat.invoke('SendMessage', room.id, message, null, null);
    await chat.stop();

    const ctx = await api.authContext(userB.accessToken);
    const history = await ctx.get(`/api/rooms/${room.id}/messages`);
    expect(history.status(), await history.text()).toBe(200);
    const messages = await history.json();
    expect(messages.some((m: { content: string | null }) => m.content === message)).toBe(true);
    await ctx.dispose();
  });

  test('recipient sees message in browser UI within 3 seconds of sender posting via hub', async ({
    userA,
    userB,
    userAPage,
    api,
  }) => {
    // userA opens room in browser; userB sends via hub; userA's UI must render it within 3 seconds
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const message = `rt-browser-${Date.now()}`;

    // Navigate userA to the room BEFORE userB sends so the SignalR event can arrive live
    await userAPage.goto(`/app/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 10_000 });

    // userB sends via hub (simulates a real-time send from another browser tab)
    const chat = await createHubConnection('/hubs/chat', userB.accessToken);
    await chat.invoke('SendMessage', room.id, message, null, null);
    await chat.stop();

    // The [data-testid="message-text"] elements are rendered per-message in the chat-area.
    // Wait up to 3 seconds for one matching the sent content — confirming live delivery.
    await expect(
      userAPage.locator('[data-testid="chat-area"] [data-testid="message-text"]').filter({ hasText: message }),
    ).toBeVisible({ timeout: 3_000 });
  });

  test.skip('quoted replies behave correctly in browser UI', async () => {
    // BLOCKED: no reply/quote controls are wired in the room UI.
  });
});
