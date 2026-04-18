import { test, expect } from '../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../helpers/room.helpers';

test.describe('Room moderation', () => {
  test('room creator is automatically owner and can see their role through members API', async ({ userA, api }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    const members = await api.getMembers(room.id, userA.accessToken);

    expect(members).toContainEqual(
      expect.objectContaining({
        userId: userA.id,
        role: 'Owner',
      }),
    );
  });

  test('owner bans a member and the banned user cannot rejoin', async ({ userA, userB, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);

    await api.banMember(room.id, userB.id, userA.accessToken);

    const bannedCtx = await api.authContext(userB.accessToken);
    const members = await bannedCtx.get(`/api/rooms/${room.id}/members`);
    expect(members.status()).toBe(403);

    const rejoin = await bannedCtx.post(`/api/rooms/${room.id}/join`);
    expect(rejoin.status()).toBe(403);
    await bannedCtx.dispose();
  });

  test('owner cannot be banned by an admin', async ({ userA, userB, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    await api.makeAdmin(room.id, userB.id, userA.accessToken);

    const adminCtx = await api.authContext(userB.accessToken);
    const res = await adminCtx.post(`/api/rooms/${room.id}/members/${userA.id}/ban`, {
      data: { reason: 'attempt owner ban' },
    });
    expect(res.status()).toBe(400);
    await adminCtx.dispose();
  });

  test('admin role can ban a normal member', async ({ api }) => {
    const owner = await api.register();
    const admin = await api.register();
    const member = await api.register();
    const room = await createPublicRoomWithMembers(api, owner, [admin, member]);

    await api.makeAdmin(room.id, admin.id, owner.accessToken);
    await api.banMember(room.id, member.id, admin.accessToken);

    const memberCtx = await api.authContext(member.accessToken);
    expect((await memberCtx.post(`/api/rooms/${room.id}/join`)).status()).toBe(403);
    await memberCtx.dispose();
  });

  test.skip('removing a user from room UI is treated as a ban', async () => {
    // BLOCKED: management UI is static and has no remove-member action wired to the ban endpoint.
  });

  test.skip('banned user is removed from room browser UI immediately', async () => {
    // BLOCKED: BanMember endpoint persists the ban but does not broadcast RemovedFromRoom to active connections yet.
  });

  test.skip('banned user loses room file access', async () => {
    // BLOCKED: attachment download endpoint is not mapped, so file access revocation cannot be verified.
  });
});
