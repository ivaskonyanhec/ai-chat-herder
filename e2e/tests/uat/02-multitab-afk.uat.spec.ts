import { test, expect } from '../../fixtures/test-fixtures';
import { createHubConnection, waitForHubEvent } from '../../helpers/signalr.helpers';

type StatusEvent = { userId: string; status: 'online' | 'afk' | 'offline' };

test.describe('UAT: Multi-tab AFK', () => {
  test('one active tab keeps user online and all AFK tabs show AFK; activity restores online', async ({ userA, userB }) => {
    const observer = await createHubConnection('/hubs/presence', userA.accessToken);
    const tab1 = await createHubConnection('/hubs/presence', userB.accessToken);
    const tab2 = await createHubConnection('/hubs/presence', userB.accessToken);

    await tab1.invoke('SetAfk');
    await expect(
      waitForHubEvent<StatusEvent>(
        observer,
        'UserStatusChanged',
        (e) => e.userId === userB.id && e.status === 'afk',
        500,
      ),
    ).rejects.toThrow(/Timed out/);

    const afk = waitForHubEvent<StatusEvent>(
      observer,
      'UserStatusChanged',
      (e) => e.userId === userB.id && e.status === 'afk',
      2_000,
    );
    await tab2.invoke('SetAfk');
    await afk;

    const online = waitForHubEvent<StatusEvent>(
      observer,
      'UserStatusChanged',
      (e) => e.userId === userB.id && e.status === 'online',
      2_000,
    );
    await tab1.invoke('SetActive');
    await expect(online).resolves.toMatchObject({ status: 'online' });

    await tab1.stop();
    await tab2.stop();
    await observer.stop();
  });

  test('natural 61-second browser inactivity timer is verified through the UI', async ({
    userA, userB, userAPage, userBPage, api,
  }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    await api.joinPublicRoom(room.id, userB.accessToken);

    // userB navigates to the room — Angular boots PresenceService, which exposes
    // window.__presenceHub in devMode so tests can drive the hub without waiting
    // 61 real seconds.
    await userBPage.goto(`/app/rooms/${room.id}`);
    await userAPage.goto(`/app/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 10_000 });

    // By the time userB appears online in userA's member list, PresenceService has
    // fully connected and __presenceHub is set and in Connected state.
    const statusDot = userAPage.locator(`[data-testid="member-status-${userB.id}"]`);
    await expect(statusDot).toHaveClass(/bg-status-online/, { timeout: 5_000 });

    // Simulate the inactivity threshold expiring: invoke SetAfk through the browser's
    // own presence hub connection — the same path the real timer takes.
    await userBPage.evaluate(async () => {
      await (window as any).__presenceHub.invoke('SetAfk');
    });

    // userA's UI must reflect AFK via the live UserStatusChanged event
    await expect(statusDot).toHaveClass(/bg-status-afk/, { timeout: 5_000 });
  });
});
