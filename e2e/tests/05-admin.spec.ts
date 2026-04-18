import { test, expect, request as pwRequest } from '../fixtures/test-fixtures';

test.describe('Admin Controls', () => {

  test('room creator is automatically the owner', async ({ userAPage, userA, api }) => {
    const room = await api.createRoom(userA.accessToken);
    await userAPage.goto(`/rooms/${room.id}`);

    await expect(
      userAPage.locator(`[data-testid="member-role-${userA.id}"]`),
    ).toHaveText('owner', { timeout: 5_000 });
  });

  test('banned member is immediately disconnected from the room', async ({
    userAPage, userBPage, userA, userB, api,
  }) => {
    const room = await api.createRoom(userA.accessToken, { isPublic: false });
    await api.addMember(room.id, userB.id, userA.accessToken);

    // Both users open the room.
    await Promise.all([
      userAPage.goto(`/rooms/${room.id}`),
      userBPage.goto(`/rooms/${room.id}`),
    ]);
    await expect(userBPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 5_000 });

    // Admin (User A) opens the admin modal and bans User B via the UI.
    await userAPage.click('[data-testid="admin-modal-btn"]');
    await userAPage.click('[data-testid="tab-members"]');
    await userAPage.click(`[data-testid="ban-member-${userB.id}"]`);
    await userAPage.click('[data-testid="ban-confirm"]');

    // User B must lose access within 3s — Angular receives RemovedFromRoom via SignalR.
    await expect(userBPage.locator('[data-testid="chat-area"]')).not.toBeVisible({ timeout: 3_000 });
  });

  test('banned user receives 403 when attempting to rejoin', async ({ userA, userB, api }) => {
    const room = await api.createRoom(userA.accessToken, { isPublic: false });
    await api.addMember(room.id, userB.id, userA.accessToken);
    await api.banMember(room.id, userB.id, userA.accessToken);

    // User B attempts to re-add themselves — must be forbidden.
    const ctx = await pwRequest.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost',
      extraHTTPHeaders: { Authorization: `Bearer ${userB.accessToken}` },
    });
    const res = await ctx.post(`/api/rooms/${room.id}/members/${userB.id}`);
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test('owner cannot be banned by an admin', async ({ userA, userB, api }) => {
    const room = await api.createRoom(userA.accessToken);
    await api.addMember(room.id, userB.id, userA.accessToken);

    // Promote User B to admin.
    const promoteCtx = await pwRequest.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost',
      extraHTTPHeaders: { Authorization: `Bearer ${userA.accessToken}` },
    });
    await promoteCtx.post(`/api/rooms/${room.id}/admins/${userB.id}`);
    await promoteCtx.dispose();

    // User B (admin) tries to ban User A (owner) — must get 403.
    const banCtx = await pwRequest.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost',
      extraHTTPHeaders: { Authorization: `Bearer ${userB.accessToken}` },
    });
    const res = await banCtx.delete(`/api/rooms/${room.id}/members/${userA.id}`);
    expect(res.status()).toBe(403);
    await banCtx.dispose();
  });
});
