import { test, expect } from '../fixtures/test-fixtures';
import type { ApiHelpers } from '../helpers/api.helpers';

async function getMyRoomsStatus(api: ApiHelpers, accessToken: string): Promise<number> {
  const ctx = await api.authContext(accessToken);
  const res = await ctx.get('/api/rooms/my');
  const status = res.status();
  await ctx.dispose();
  return status;
}

test.describe('Platform bans', () => {
  test('issued platform ban blocks authenticated API access until revoked', async ({ api }) => {
    const admin = await api.register();
    const target = await api.register();
    const reason = `platform-ban-${Date.now()}`;

    await api.issuePlatformBan(admin.accessToken, target.username, reason, 1);

    const bans = await api.getPlatformBans(admin.accessToken);
    expect(bans).toContainEqual(
      expect.objectContaining({
        userId: target.id,
        username: target.username,
        issuedByAdminId: admin.id,
        issuedByAdminUsername: admin.username,
        reason,
        revokedAt: null,
      }),
    );

    const bannedCtx = await api.authContext(target.accessToken);
    expect((await bannedCtx.get('/api/rooms/my')).status()).toBe(403);
    await bannedCtx.dispose();

    await api.revokePlatformBan(admin.accessToken, target.id);

    const restoredCtx = await api.authContext(target.accessToken);
    expect((await restoredCtx.get('/api/rooms/my')).status()).toBe(200);
    await restoredCtx.dispose();
  });

  test('admin page can issue and revoke a platform ban', async ({ api, userAPage }) => {
    const target = await api.register();
    const reason = `ui-platform-ban-${Date.now()}`;

    await userAPage.goto('/app/admin');
    await userAPage.getByPlaceholder('Search by username...').fill(target.username);
    await userAPage.getByPlaceholder('Ban reason (required)').fill(reason);
    await userAPage.getByRole('button', { name: 'Issue Ban' }).click();

    const targetRow = userAPage.locator('tbody tr').filter({ hasText: target.username });
    await expect(targetRow).toBeVisible({ timeout: 10_000 });
    await expect(targetRow).toContainText(reason);
    await expect.poll(() => getMyRoomsStatus(api, target.accessToken)).toBe(403);

    await targetRow.getByRole('button', { name: 'Revoke' }).click();

    await expect.poll(() => getMyRoomsStatus(api, target.accessToken)).toBe(200);
    await expect(userAPage.locator('tbody tr').filter({ hasText: target.username })).toHaveCount(0);
  });
});
