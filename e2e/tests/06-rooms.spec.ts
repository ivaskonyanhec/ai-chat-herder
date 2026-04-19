import { test, expect } from '../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../helpers/room.helpers';

test.describe('Room catalog, membership, and invitations', () => {
  test('room names are unique', async ({ api, userA }) => {
    const name = `unique-room-${Date.now()}`;
    await api.createRoom(userA.accessToken, { name, visibility: 'Public' });

    const ctx = await api.authContext(userA.accessToken);
    const duplicate = await ctx.post('/api/rooms', {
      data: {
        name,
        description: 'duplicate attempt',
        visibility: 'Public',
      },
    });

    expect(duplicate.status()).toBe(409);
    await ctx.dispose();
  });

  test('public room catalog exposes name, description, and member count and supports search', async ({
    api,
    userA,
    userB,
  }) => {
    const searchableName = `catalog-${Date.now()}`;
    const room = await api.createRoom(userA.accessToken, {
      name: searchableName,
      description: 'Searchable E2E room',
      visibility: 'Public',
    });
    await api.joinPublicRoom(room.id, userB.accessToken);

    const ctx = await api.context();
    const catalog = await ctx.get(`/api/rooms?search=${encodeURIComponent(searchableName)}`);
    expect(catalog.status(), await catalog.text()).toBe(200);
    const rooms = await catalog.json();
    expect(rooms).toContainEqual(
      expect.objectContaining({
        id: room.id,
        name: searchableName,
        description: 'Searchable E2E room',
        memberCount: 2,
      }),
    );
    await ctx.dispose();
  });

  test('private rooms are hidden from public catalog and cannot be joined directly', async ({ api, userA, userB }) => {
    const name = `private-${Date.now()}`;
    const room = await api.createRoom(userA.accessToken, {
      name,
      description: 'Private E2E room',
      visibility: 'Private',
    });

    const publicCtx = await api.context();
    const catalog = await publicCtx.get(`/api/rooms?search=${encodeURIComponent(name)}`);
    expect(catalog.status(), await catalog.text()).toBe(200);
    const rooms = await catalog.json();
    expect(rooms.some((r: { id: string }) => r.id === room.id)).toBe(false);
    await publicCtx.dispose();

    const userBCtx = await api.authContext(userB.accessToken);
    const join = await userBCtx.post(`/api/rooms/${room.id}/join`);
    expect(join.status()).toBe(403);
    await userBCtx.dispose();
  });

  test('private room invitation allows invited user to join', async ({ api, userA, userB }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Private' });
    const ownerCtx = await api.authContext(userA.accessToken);
    const invite = await ownerCtx.post(`/api/rooms/${room.id}/invitations`, {
      data: { username: userB.username },
    });
    expect(invite.status(), await invite.text()).toBe(204);
    await ownerCtx.dispose();

    const inviteeCtx = await api.authContext(userB.accessToken);
    const invitations = await inviteeCtx.get('/api/invitations');
    expect(invitations.status(), await invitations.text()).toBe(200);
    const body = await invitations.json();
    const invitation = body.find((i: { roomId: string }) => i.roomId === room.id);
    expect(invitation?.id).toBeTruthy();

    const accept = await inviteeCtx.post(`/api/invitations/${invitation.id}/accept`);
    expect(accept.status(), await accept.text()).toBe(204);
    await inviteeCtx.dispose();

    const members = await api.getMembers(room.id, userA.accessToken);
    expect(members.map((m) => m.userId)).toContain(userB.id);
  });

  test('owner can update room settings via PATCH and changes are reflected in room details', async ({ api, userA }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    const updatedName = `updated-${Date.now()}`;
    const updatedDesc = 'Updated description E2E';

    const ctx = await api.authContext(userA.accessToken);
    const patch = await ctx.patch(`/api/rooms/${room.id}`, {
      data: { name: updatedName, description: updatedDesc },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    const body = await patch.json();
    expect(body.name).toBe(updatedName);
    expect(body.description).toBe(updatedDesc);

    const get = await ctx.get(`/api/rooms/${room.id}`);
    expect(get.status()).toBe(200);
    const fetched = await get.json();
    expect(fetched.name).toBe(updatedName);
    await ctx.dispose();
  });

  test('invited user can reject a room invitation and does not appear as a member', async ({ api, userA, userB }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Private' });
    const ownerCtx = await api.authContext(userA.accessToken);
    const invite = await ownerCtx.post(`/api/rooms/${room.id}/invitations`, {
      data: { username: userB.username },
    });
    expect(invite.status(), await invite.text()).toBe(204);
    await ownerCtx.dispose();

    const inviteeCtx = await api.authContext(userB.accessToken);
    const invitations = await inviteeCtx.get('/api/invitations');
    const body = await invitations.json();
    const invitation = body.find((i: { roomId: string }) => i.roomId === room.id);
    expect(invitation?.id).toBeTruthy();

    const reject = await inviteeCtx.post(`/api/invitations/${invitation.id}/reject`);
    expect(reject.status(), await reject.text()).toBe(204);
    await inviteeCtx.dispose();

    const members = await api.getMembers(room.id, userA.accessToken);
    expect(members.map((m) => m.userId)).not.toContain(userB.id);
  });

  test('member can leave a room, but owner cannot leave their own room', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);

    const memberCtx = await api.authContext(userB.accessToken);
    const leave = await memberCtx.delete(`/api/rooms/${room.id}/leave`);
    expect(leave.status()).toBe(204);
    await memberCtx.dispose();

    const membersAfterLeave = await api.getMembers(room.id, userA.accessToken);
    expect(membersAfterLeave.map((m) => m.userId)).not.toContain(userB.id);

    const ownerCtx = await api.authContext(userA.accessToken);
    const ownerLeave = await ownerCtx.delete(`/api/rooms/${room.id}/leave`);
    expect(ownerLeave.status()).toBe(400);
    await ownerCtx.dispose();
  });
});
