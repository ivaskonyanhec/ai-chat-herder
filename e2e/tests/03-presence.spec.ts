import { test, expect } from '../fixtures/test-fixtures';

// ─── Implementation dependency ────────────────────────────────────────────────
// PresenceService must expose the SignalR connection in dev mode:
//   if (isDevMode()) { (window as any).__presenceHub = this.connection; }
// This lets the AFK test call SetAfk() directly without waiting 60 seconds.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Presence Engine', () => {

  test('User B appears Online to User A after connecting', async ({
    userAPage, userBPage, userA, userB, api,
  }) => {
    const room = await api.createRoom(userA.accessToken);
    await api.addMember(room.id, userB.id, userA.accessToken);

    await userAPage.goto(`/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 5_000 });

    // User B joins after A — A receives UserStatusChanged(online) via SignalR.
    await userBPage.goto(`/rooms/${room.id}`);

    await expect(
      userAPage.locator(`[data-testid="member-status-${userB.id}"]`),
    ).toHaveAttribute('data-status', 'online', { timeout: 3_000 });
  });

  test('AFK status propagates to User A within 2 seconds', async ({
    userAPage, userBPage, userA, userB, api,
  }) => {
    const room = await api.createRoom(userA.accessToken);
    await api.addMember(room.id, userB.id, userA.accessToken);

    await Promise.all([
      userAPage.goto(`/rooms/${room.id}`),
      userBPage.goto(`/rooms/${room.id}`),
    ]);

    const statusDot = userAPage.locator(`[data-testid="member-status-${userB.id}"]`);
    await expect(statusDot).toHaveAttribute('data-status', 'online', { timeout: 3_000 });

    // Call SetAfk() directly via the dev-mode hub reference — bypasses the 60s inactivity timer.
    await userBPage.evaluate(async () => {
      const hub = (window as any).__presenceHub;
      if (!hub) throw new Error('__presenceHub not found — set it in PresenceService when isDevMode()');
      await hub.invoke('SetAfk');
    });

    // SLA: AFK must propagate within 2s (AGENT.md §12).
    await expect(statusDot).toHaveAttribute('data-status', 'afk', { timeout: 2_000 });
  });

  test('User B returns to Online after SetActive', async ({
    userAPage, userBPage, userA, userB, api,
  }) => {
    const room = await api.createRoom(userA.accessToken);
    await api.addMember(room.id, userB.id, userA.accessToken);

    await Promise.all([
      userAPage.goto(`/rooms/${room.id}`),
      userBPage.goto(`/rooms/${room.id}`),
    ]);

    // Go AFK.
    await userBPage.evaluate(async () => {
      await (window as any).__presenceHub?.invoke('SetAfk');
    });

    const statusDot = userAPage.locator(`[data-testid="member-status-${userB.id}"]`);
    await expect(statusDot).toHaveAttribute('data-status', 'afk', { timeout: 2_000 });

    // Come back active.
    await userBPage.evaluate(async () => {
      await (window as any).__presenceHub?.invoke('SetActive');
    });

    await expect(statusDot).toHaveAttribute('data-status', 'online', { timeout: 2_000 });
  });

  test('User B appears Offline after closing the tab', async ({
    userAPage, userBPage, userA, userB, api,
  }) => {
    const room = await api.createRoom(userA.accessToken);
    await api.addMember(room.id, userB.id, userA.accessToken);

    await Promise.all([
      userAPage.goto(`/rooms/${room.id}`),
      userBPage.goto(`/rooms/${room.id}`),
    ]);

    const statusDot = userAPage.locator(`[data-testid="member-status-${userB.id}"]`);
    await expect(statusDot).toHaveAttribute('data-status', 'online', { timeout: 3_000 });

    // Closing the page fires SignalR OnDisconnectedAsync → cleans presence keys.
    await userBPage.close();

    await expect(statusDot).toHaveAttribute('data-status', 'offline', { timeout: 3_000 });
  });
});
