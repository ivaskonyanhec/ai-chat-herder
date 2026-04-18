import { test, expect, request } from '../fixtures/test-fixtures';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

test.describe('File Attachments', () => {

  test('upload 5 MB file and User B can download it', async ({
    userAPage, userBPage, userA, userB, api,
  }) => {
    const room = await api.createRoom(userA.accessToken);
    await api.addMember(room.id, userB.id, userA.accessToken);

    await Promise.all([
      userAPage.goto(`/rooms/${room.id}`),
      userBPage.goto(`/rooms/${room.id}`),
    ]);

    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 5_000 });
    await expect(userBPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 5_000 });

    // Generate a 5 MB temp file filled with a repeating pattern.
    const tmpPath = path.join(os.tmpdir(), `e2e-5mb-${Date.now()}.bin`);
    fs.writeFileSync(tmpPath, Buffer.alloc(5 * 1024 * 1024, 0xab));

    try {
      // setInputFiles works on hidden <input type="file"> elements.
      await userAPage.setInputFiles('[data-testid="file-input"]', tmpPath);
      await userAPage.click('[data-testid="upload-submit"]');

      // User B must see the attachment message within 15s (upload + SignalR broadcast).
      const downloadLink = userBPage.locator('[data-testid="attachment-download-link"]').first();
      await expect(downloadLink).toBeVisible({ timeout: 15_000 });

      // Verify the download endpoint returns 200 (membership is validated server-side).
      const [response] = await Promise.all([
        userBPage.waitForResponse(
          (resp) => resp.url().includes('/api/files/') && resp.request().method() === 'GET',
          { timeout: 10_000 },
        ),
        downloadLink.click(),
      ]);
      expect(response.status()).toBe(200);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  test('non-member receives 403 when attempting to download', async ({ userA, userB, api }) => {
    // Create a private room with only User A — User B is never added.
    const room = await api.createRoom(userA.accessToken, { isPublic: false });

    // Upload a small file as User A via the API (faster than driving the UI).
    const tmpPath = path.join(os.tmpdir(), `e2e-403-${Date.now()}.bin`);
    fs.writeFileSync(tmpPath, Buffer.alloc(1024, 0xff));

    try {
      const uploadCtx = await request.newContext({
        baseURL: process.env.BASE_URL ?? 'http://localhost',
        extraHTTPHeaders: { Authorization: `Bearer ${userA.accessToken}` },
      });
      const uploadRes = await uploadCtx.post('/api/files/upload', {
        multipart: {
          file:   { name: 'test.bin', mimeType: 'application/octet-stream', buffer: fs.readFileSync(tmpPath) },
          roomId: room.id,
        },
      });
      expect(uploadRes.ok()).toBe(true);
      const { attachmentId } = await uploadRes.json();
      await uploadCtx.dispose();

      // User B (not a member) attempts to download — must get 403.
      const downloadCtx = await request.newContext({
        baseURL: process.env.BASE_URL ?? 'http://localhost',
        extraHTTPHeaders: { Authorization: `Bearer ${userB.accessToken}` },
      });
      const forbiddenRes = await downloadCtx.get(`/api/files/${attachmentId}`);
      expect(forbiddenRes.status()).toBe(403);
      await downloadCtx.dispose();
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });
});
