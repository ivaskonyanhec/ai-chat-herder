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

  test.skip('banned user is removed from the visible room UI immediately', async () => {
    // BLOCKED: ban endpoint does not broadcast RemovedFromRoom and management modal is not wired.
  });
});
