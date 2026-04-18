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

  test.skip('presence dots update in the room member list UI', async () => {
    // BLOCKED: room member list is currently static and lacks member-status-{userId} bindings.
  });
});
