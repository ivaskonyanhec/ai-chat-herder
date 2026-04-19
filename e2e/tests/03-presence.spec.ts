import { test, expect } from '../fixtures/test-fixtures';
import { createHubConnection, waitForHubEvent } from '../helpers/signalr.helpers';

type StatusEvent = { userId: string; status: 'online' | 'afk' | 'offline' };

test.describe('Presence Engine', () => {
  test('online status propagates to another connected user within 2 seconds', async ({ userA, userB }) => {
    const observer = await createHubConnection('/hubs/presence', userA.accessToken);
    const online = waitForHubEvent<StatusEvent>(
      observer,
      'UserStatusChanged',
      (e) => e.userId === userB.id && e.status === 'online',
      2_000,
    );

    const observed = await createHubConnection('/hubs/presence', userB.accessToken);
    await expect(online).resolves.toMatchObject({ userId: userB.id, status: 'online' });

    await observed.stop();
    await observer.stop();
  });

  test('AFK status only appears after all tabs for the user are AFK', async ({ userA, userB }) => {
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
    await expect(afk).resolves.toMatchObject({ userId: userB.id, status: 'afk' });

    await tab1.stop();
    await tab2.stop();
    await observer.stop();
  });

  test('activity in one tab restores online status', async ({ userA, userB }) => {
    const observer = await createHubConnection('/hubs/presence', userA.accessToken);
    const tab1 = await createHubConnection('/hubs/presence', userB.accessToken);
    const tab2 = await createHubConnection('/hubs/presence', userB.accessToken);

    const afk = waitForHubEvent<StatusEvent>(
      observer,
      'UserStatusChanged',
      (e) => e.userId === userB.id && e.status === 'afk',
      2_000,
    );
    await tab1.invoke('SetAfk');
    await tab2.invoke('SetAfk');
    await afk;

    const online = waitForHubEvent<StatusEvent>(
      observer,
      'UserStatusChanged',
      (e) => e.userId === userB.id && e.status === 'online',
      2_000,
    );
    await tab1.invoke('SetActive');
    await expect(online).resolves.toMatchObject({ userId: userB.id, status: 'online' });

    await tab1.stop();
    await tab2.stop();
    await observer.stop();
  });

  test('offline status appears only after all tabs close', async ({ userA, userB }) => {
    const observer = await createHubConnection('/hubs/presence', userA.accessToken);
    const tab1 = await createHubConnection('/hubs/presence', userB.accessToken);
    const tab2 = await createHubConnection('/hubs/presence', userB.accessToken);

    await tab1.stop();
    await expect(
      waitForHubEvent<StatusEvent>(
        observer,
        'UserStatusChanged',
        (e) => e.userId === userB.id && e.status === 'offline',
        500,
      ),
    ).rejects.toThrow(/Timed out/);

    const offline = waitForHubEvent<StatusEvent>(
      observer,
      'UserStatusChanged',
      (e) => e.userId === userB.id && e.status === 'offline',
      2_000,
    );
    await tab2.stop();
    await expect(offline).resolves.toMatchObject({ userId: userB.id, status: 'offline' });
    await observer.stop();
  });

  test('presence dots update in the room member list UI', async ({ userA, userB, userAPage, api }) => {
    const room = await api.createRoom(userA.accessToken, { visibility: 'Public' });
    await api.joinPublicRoom(room.id, userB.accessToken);

    // userB connects to presence hub — goes online
    const presenceB = await createHubConnection('/hubs/presence', userB.accessToken);

    // userA navigates to room — joins room group and receives RoomMembersSnapshot
    await userAPage.goto(`/app/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 10_000 });

    const statusDot = userAPage.locator(`[data-testid="member-status-${userB.id}"]`);
    await expect(statusDot).toBeVisible({ timeout: 5_000 });
    await expect(statusDot).toHaveClass(/bg-status-online/, { timeout: 5_000 });

    // userB goes AFK — status dot should update live via UserStatusChanged event
    await presenceB.invoke('SetAfk');
    await expect(statusDot).toHaveClass(/bg-status-afk/, { timeout: 5_000 });

    await presenceB.stop();
  });
});
