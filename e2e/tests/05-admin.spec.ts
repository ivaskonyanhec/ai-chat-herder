import { test, expect } from '../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../helpers/room.helpers';
import { createHubConnection } from '../helpers/signalr.helpers';

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

  test('owner can view ban details, unban a member, and the member can rejoin', async ({ userA, userB, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const reason = `e2e-unban-${Date.now()}`;

    await api.banMember(room.id, userB.id, userA.accessToken, reason);

    const bans = await api.getRoomBans(room.id, userA.accessToken);
    expect(bans).toContainEqual(
      expect.objectContaining({
        bannedUserId: userB.id,
        bannedUsername: userB.username,
        bannedByUserId: userA.id,
        bannedByUsername: userA.username,
        reason,
      }),
    );

    await api.unbanMember(room.id, userB.id, userA.accessToken);
    await api.joinPublicRoom(room.id, userB.accessToken);

    const members = await api.getMembers(room.id, userA.accessToken);
    expect(members.map(m => m.userId)).toContain(userB.id);
  });

  test('admin cannot remove owner admin status', async ({ userA, userB, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    await api.makeAdmin(room.id, userB.id, userA.accessToken);

    const adminCtx = await api.authContext(userB.accessToken);
    const attempt = await adminCtx.delete(`/api/rooms/${room.id}/members/${userA.id}/admin`);
    expect(attempt.status()).toBe(400);
    await adminCtx.dispose();

    const members = await api.getMembers(room.id, userA.accessToken);
    expect(members).toContainEqual(expect.objectContaining({ userId: userA.id, role: 'Owner' }));
  });

  test('owner can remove admin status and demoted user loses admin permissions', async ({ api }) => {
    const owner = await api.register();
    const admin = await api.register();
    const member = await api.register();
    const room = await createPublicRoomWithMembers(api, owner, [admin, member]);

    await api.makeAdmin(room.id, admin.id, owner.accessToken);
    await api.removeAdmin(room.id, admin.id, owner.accessToken);

    const members = await api.getMembers(room.id, owner.accessToken);
    expect(members).toContainEqual(
      expect.objectContaining({
        userId: admin.id,
        role: 'Member',
      }),
    );

    const demotedCtx = await api.authContext(admin.accessToken);
    const banAttempt = await demotedCtx.post(`/api/rooms/${room.id}/members/${member.id}/ban`, {
      data: { reason: 'demoted user attempt' },
    });
    expect(banAttempt.status()).toBe(403);
    await demotedCtx.dispose();
  });

  test('room admin can delete another user message', async ({ api }) => {
    const owner = await api.register();
    const admin = await api.register();
    const member = await api.register();
    const room = await createPublicRoomWithMembers(api, owner, [admin, member]);
    await api.makeAdmin(room.id, admin.id, owner.accessToken);

    const chat = await createHubConnection('/hubs/chat', member.accessToken);
    const content = `admin-delete-${Date.now()}`;
    await chat.invoke('SendMessage', room.id, content, null, null);
    await chat.stop();

    const ownerCtx = await api.authContext(owner.accessToken);
    const history = await ownerCtx.get(`/api/rooms/${room.id}/messages`);
    expect(history.status(), await history.text()).toBe(200);
    const messages = await history.json();
    const message = messages.find((m: { content: string | null }) => m.content === content);
    expect(message?.id).toBeTruthy();
    await ownerCtx.dispose();

    const adminCtx = await api.authContext(admin.accessToken);
    const deletion = await adminCtx.delete(`/api/rooms/${room.id}/messages/${message.id}`);
    expect(deletion.status(), await deletion.text()).toBe(204);
    await adminCtx.dispose();

    const afterDeleteCtx = await api.authContext(owner.accessToken);
    const afterDelete = await afterDeleteCtx.get(`/api/rooms/${room.id}/messages`);
    const remaining = await afterDelete.json();
    const deletedMsg = remaining.find((m: { id: string }) => m.id === message.id);
    expect(deletedMsg).toMatchObject({ isDeleted: true, content: null });
    await afterDeleteCtx.dispose();
  });

  test('owner deletes a room and linked messages/files are no longer accessible', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const attachment = await api.uploadFile(
      userA.accessToken,
      { name: 'delete-room.txt', mimeType: 'text/plain', buffer: Buffer.from('delete with room') },
    );
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);

    await chat.invoke('SendMessage', room.id, 'delete room attachment', null, attachment.id);
    await chat.stop();

    const ownerCtx = await api.authContext(userA.accessToken);
    expect((await ownerCtx.delete(`/api/rooms/${room.id}`)).status()).toBe(204);
    expect((await ownerCtx.get(`/api/rooms/${room.id}`)).status()).toBe(404);
    await ownerCtx.dispose();

    const memberCtx = await api.authContext(userB.accessToken);
    expect((await memberCtx.get(`/api/rooms/${room.id}/messages`)).status()).toBe(403);
    expect((await memberCtx.get(`/api/files/${attachment.id}`)).status()).toBe(404);
    await memberCtx.dispose();
  });

  test('removing a user from room UI is treated as a ban', async ({
    userA, userB, userAPage, api,
  }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);

    // Owner navigates to manage-room
    await userAPage.goto(`/app/rooms/${room.id}/manage`);
    await expect(userAPage.locator(`[data-testid="member-row-${userB.id}"]`)).toBeVisible({ timeout: 10_000 });

    // Click the Ban button — revealed on hover; Playwright clicks even when opacity-0
    await userAPage.locator(`[data-testid="ban-member-${userB.id}"]`).click();

    // Verify via API that userB is now banned and cannot access the room
    const bannedCtx = await api.authContext(userB.accessToken);
    await expect
      .poll(() => bannedCtx.get(`/api/rooms/${room.id}/members`).then(r => r.status()), { timeout: 5_000 })
      .toBe(403);
    await bannedCtx.dispose();
  });

  test('banned user is removed from room browser UI immediately', async ({
    userA, userB, userBPage, api,
  }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);

    // userB opens the room in their browser
    await userBPage.goto(`/app/rooms/${room.id}`);
    await expect(userBPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 10_000 });

    // Owner bans userB via API — RemovedFromRoom is broadcast to userB's active hub connections
    await api.banMember(room.id, userB.id, userA.accessToken);

    // room-chat.ts listens for removedFromRoom and navigates away from the room
    await expect(userBPage).not.toHaveURL(new RegExp(`rooms/${room.id}`), { timeout: 8_000 });
  });

  // Covered in e2e/tests/04-attachments.spec.ts by the "banned room user loses access" file test.
});
