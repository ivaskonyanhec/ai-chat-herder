import { test, expect } from '../fixtures/test-fixtures';

test.describe('Real-time messaging', () => {

  test('message delivered to second user within 3 seconds', async ({
    userAPage, userBPage, userA, userB, api,
  }) => {
    const room = await api.createRoom(userA.accessToken, { isPublic: true });
    await api.addMember(room.id, userB.id, userA.accessToken);

    await Promise.all([
      userAPage.goto(`/rooms/${room.id}`),
      userBPage.goto(`/rooms/${room.id}`),
    ]);

    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 5_000 });
    await expect(userBPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 5_000 });

    const message = `hello-${Date.now()}`;
    const sentAt  = Date.now();

    await userAPage.fill('[data-testid="message-input"]', message);
    await userAPage.keyboard.press('Enter');

    // User B must receive the message via SignalR within the 3s delivery SLA.
    const msgLocator = userBPage.locator('[data-testid="message-text"]', { hasText: message });
    await expect(msgLocator).toBeVisible({ timeout: 3_000 });

    expect(Date.now() - sentAt).toBeLessThan(3_000);
  });

  test('sender sees their own message immediately', async ({ userAPage, userA, api }) => {
    const room = await api.createRoom(userA.accessToken);
    await userAPage.goto(`/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 5_000 });

    const message = `self-${Date.now()}`;
    await userAPage.fill('[data-testid="message-input"]', message);
    await userAPage.keyboard.press('Enter');

    // Loopback or optimistic render — must appear within 1s.
    await expect(
      userAPage.locator('[data-testid="message-text"]', { hasText: message }),
    ).toBeVisible({ timeout: 1_000 });
  });

  test('message input clears after send', async ({ userAPage, userA, api }) => {
    const room = await api.createRoom(userA.accessToken);
    await userAPage.goto(`/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 5_000 });

    await userAPage.fill('[data-testid="message-input"]', 'test-clear');
    await userAPage.keyboard.press('Enter');

    await expect(userAPage.locator('[data-testid="message-input"]')).toHaveValue('', { timeout: 1_000 });
  });
});
