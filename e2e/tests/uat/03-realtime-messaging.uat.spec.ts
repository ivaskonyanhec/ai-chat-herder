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

  test.skip('recipient receives message in browser UI within 3 seconds', async () => {
    // BLOCKED: current room UI does not render live ChatService events.
  });

  test.skip('quoted replies behave correctly in browser UI', async () => {
    // BLOCKED: no reply/quote controls are wired in the room UI.
  });
});
