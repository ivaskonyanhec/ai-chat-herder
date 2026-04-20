import { test, expect } from '../fixtures/test-fixtures';
import { createHubConnection } from '../helpers/signalr.helpers';
import { becomeFriends } from '../helpers/friends.helpers';

test.describe('Direct messages', () => {
  test('DM message sent via SignalR appears in history for both participants', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `dm-api-${Date.now()}`;

    await chat.invoke('SendDirectMessage', dialog.id, content, null, null);
    await chat.stop();

    const historyA = await api.getDialogMessages(userA.accessToken, dialog.id);
    expect(historyA.some(m => m.content === content)).toBe(true);

    const historyB = await api.getDialogMessages(userB.accessToken, dialog.id);
    expect(historyB.some(m => m.content === content)).toBe(true);
  });

  test('recipient receives DM in real-time within 3 seconds', async ({ userA, userB, userBPage, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const content = `dm-realtime-${Date.now()}`;

    await userBPage.goto(`/app/messages/${dialog.id}`);
    await expect(userBPage.locator(`[data-testid="dialog-item-${dialog.id}"]`)).toBeVisible({ timeout: 10_000 });
    await userBPage.click(`[data-testid="dialog-item-${dialog.id}"]`);
    await expect(userBPage.locator('[data-testid="dm-messages"]')).toBeVisible({ timeout: 5_000 });

    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    await chat.invoke('SendDirectMessage', dialog.id, content, null, null);
    await chat.stop();

    await expect(
      userBPage.locator('[data-testid="dm-message-text"]').filter({ hasText: content }),
    ).toBeVisible({ timeout: 3_000 });
  });

  test('frozen dialog rejects SendDirectMessage via SignalR', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    await api.blockUser(userB.accessToken, userA.id);

    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    await expect(
      chat.invoke('SendDirectMessage', dialog.id, 'blocked content', null, null),
    ).rejects.toThrow();
    await chat.stop();
  });

  test('DM message author can edit their message via API', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const original = `dm-edit-before-${Date.now()}`;
    await chat.invoke('SendDirectMessage', dialog.id, original, null, null);
    await chat.stop();

    const history = await api.getDialogMessages(userA.accessToken, dialog.id);
    const msg = history.find(m => m.content === original);
    if (!msg) throw new Error('Message not found in history');

    const ctx = await api.authContext(userA.accessToken);
    const edit = await ctx.patch(`/api/dm-messages/${msg.id}`, { data: { content: 'dm-edit-after' } });
    expect(edit.status(), await edit.text()).toBe(200);
    const body = await edit.json();
    expect(body.content).toBe('dm-edit-after');
    expect(body.editedAt).toBeTruthy();
    await ctx.dispose();
  });

  test('non-author cannot edit another participant DM via API', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `dm-403-${Date.now()}`;
    await chat.invoke('SendDirectMessage', dialog.id, content, null, null);
    await chat.stop();

    const history = await api.getDialogMessages(userA.accessToken, dialog.id);
    const msg = history.find(m => m.content === content);
    if (!msg) throw new Error('Message not found');

    const ctx = await api.authContext(userB.accessToken);
    const edit = await ctx.patch(`/api/dm-messages/${msg.id}`, { data: { content: 'hijack' } });
    expect(edit.status()).toBe(403);
    await ctx.dispose();
  });

  test('DM message author can soft-delete their message', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `dm-delete-${Date.now()}`;
    await chat.invoke('SendDirectMessage', dialog.id, content, null, null);
    await chat.stop();

    const history = await api.getDialogMessages(userA.accessToken, dialog.id);
    const msg = history.find(m => m.content === content);
    if (!msg) throw new Error('Message not found');

    const ctx = await api.authContext(userA.accessToken);
    const del = await ctx.delete(`/api/dm-messages/${msg.id}`);
    expect(del.status()).toBe(204);

    const after = await api.getDialogMessages(userA.accessToken, dialog.id);
    const deleted = after.find(m => m.id === msg.id);
    expect(deleted).toMatchObject({ isDeleted: true, content: null });
    await ctx.dispose();
  });

  test('DM API returns messages newest-first (client reverses for display)', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const suffix = Date.now();
    await chat.invoke('SendDirectMessage', dialog.id, `dm-order-first-${suffix}`, null, null);
    await chat.invoke('SendDirectMessage', dialog.id, `dm-order-second-${suffix}`, null, null);
    await chat.stop();

    const history = await api.getDialogMessages(userA.accessToken, dialog.id);
    const contents = history.map(m => m.content);
    expect(contents.indexOf(`dm-order-second-${suffix}`)).toBeLessThan(
      contents.indexOf(`dm-order-first-${suffix}`),
    );
  });
});
