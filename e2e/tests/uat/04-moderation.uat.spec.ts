import { test, expect } from '../../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../../helpers/room.helpers';

test.describe('UAT: Moderation UX', () => {
  test('admin bans member and banned member cannot access the room again', async ({ userA, userB, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);

    await api.banMember(room.id, userB.id, userA.accessToken);

    const bannedCtx = await api.authContext(userB.accessToken);
    expect((await bannedCtx.get(`/api/rooms/${room.id}/members`)).status()).toBe(403);
    expect((await bannedCtx.post(`/api/rooms/${room.id}/join`)).status()).toBe(403);
    await bannedCtx.dispose();
  });

  test('banned user is removed from the visible room UI immediately', async ({
    userA, userB, userBPage, api,
  }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);

    // userB navigates to room in browser
    await userBPage.goto(`/app/rooms/${room.id}`);
    await expect(userBPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 10_000 });

    // Admin (userA) bans userB via API — PresenceHub broadcasts RemovedFromRoom to userB's connection
    await api.banMember(room.id, userB.id, userA.accessToken);

    // room-chat.ts reacts to removedFromRoom signal by navigating away from the room
    await expect(userBPage).not.toHaveURL(new RegExp(`rooms/${room.id}`), { timeout: 8_000 });
  });
});
