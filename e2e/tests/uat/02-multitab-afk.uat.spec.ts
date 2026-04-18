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

  test.skip('natural 61-second browser inactivity timer is verified through the UI', async () => {
    // BLOCKED: room member status UI is static; deterministic hub calls cover server semantics.
  });
});
