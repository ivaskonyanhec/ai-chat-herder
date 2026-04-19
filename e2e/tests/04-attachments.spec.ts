import { test, expect } from '../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../helpers/room.helpers';
import { createHubConnection } from '../helpers/signalr.helpers';

test.describe('File attachments', () => {
  test('user uploads an arbitrary file and a room member downloads it with 200', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const file = Buffer.from('E2E attachment body');
    const attachment = await api.uploadFile(
      userA.accessToken,
      { name: 'notes.txt', mimeType: 'text/plain', buffer: file },
      'meeting notes',
    );
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);

    await chat.invoke('SendMessage', room.id, 'see attached notes', null, attachment.id);
    await chat.stop();

    const memberCtx = await api.authContext(userB.accessToken);
    const download = await memberCtx.get(`/api/files/${attachment.id}`);
    expect(download.status(), await download.text()).toBe(200);
    expect(download.headers()['content-type']).toContain('text/plain');
    expect(await download.text()).toBe('E2E attachment body');
    await memberCtx.dispose();
  });

  test('user uploads an image and a room member downloads it with 200', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const attachment = await api.uploadFile(
      userA.accessToken,
      { name: 'tiny.png', mimeType: 'image/png', buffer: imageBytes },
    );
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);

    await chat.invoke('SendMessage', room.id, 'image attached', null, attachment.id);
    await chat.stop();

    const memberCtx = await api.authContext(userB.accessToken);
    const download = await memberCtx.get(`/api/files/${attachment.id}`);
    expect(download.status(), await download.text()).toBe(200);
    expect(download.headers()['content-type']).toContain('image/png');
    expect(Buffer.compare(await download.body(), imageBytes)).toBe(0);
    await memberCtx.dispose();
  });

  test('non-member cannot download a direct room attachment URL and receives 403', async ({ api }) => {
    const owner = await api.register();
    const member = await api.register();
    const outsider = await api.register();
    const room = await createPublicRoomWithMembers(api, owner, [member]);
    const attachment = await api.uploadFile(
      owner.accessToken,
      { name: 'private.txt', mimeType: 'text/plain', buffer: Buffer.from('private room file') },
    );
    const chat = await createHubConnection('/hubs/chat', owner.accessToken);

    await chat.invoke('SendMessage', room.id, 'private attachment', null, attachment.id);
    await chat.stop();

    const outsiderCtx = await api.authContext(outsider.accessToken);
    const download = await outsiderCtx.get(`/api/files/${attachment.id}`);
    expect(download.status()).toBe(403);
    await outsiderCtx.dispose();
  });

  test('dialog participant can download a DM attachment and outsider receives 403', async ({ api }) => {
    const sender = await api.register();
    const recipient = await api.register();
    const outsider = await api.register();
    const dialog = await api.createDialog(sender.accessToken, recipient.id);
    const attachment = await api.uploadFile(
      sender.accessToken,
      { name: 'dm-note.txt', mimeType: 'text/plain', buffer: Buffer.from('dialog file') },
    );
    const chat = await createHubConnection('/hubs/chat', sender.accessToken);

    await chat.invoke('SendDirectMessage', dialog.id, 'dm attachment', null, attachment.id);
    await chat.stop();

    const recipientCtx = await api.authContext(recipient.accessToken);
    const allowed = await recipientCtx.get(`/api/files/${attachment.id}`);
    expect(allowed.status(), await allowed.text()).toBe(200);
    expect(await allowed.text()).toBe('dialog file');
    await recipientCtx.dispose();

    const outsiderCtx = await api.authContext(outsider.accessToken);
    const denied = await outsiderCtx.get(`/api/files/${attachment.id}`);
    expect(denied.status()).toBe(403);
    await outsiderCtx.dispose();
  });

  test('image uploads over 3 MB are rejected', async ({ api, userA }) => {
    const ctx = await api.authContext(userA.accessToken);
    const upload = await ctx.post('/api/files/upload', {
      multipart: {
        file: {
          name: 'too-large.png',
          mimeType: 'image/png',
          buffer: Buffer.alloc(3 * 1024 * 1024 + 1),
        },
      },
    });
    expect(upload.status()).toBe(413);
    await ctx.dispose();
  });

  test('file uploads over 20 MB are rejected', async ({ api, userA }) => {
    const ctx = await api.authContext(userA.accessToken);
    const upload = await ctx.post('/api/files/upload', {
      multipart: {
        file: {
          name: 'too-large.bin',
          mimeType: 'application/octet-stream',
          buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
        },
      },
    });
    expect(upload.status()).toBe(413);
    await ctx.dispose();
  });

  test('original filename and optional comment are preserved', async ({ api, userA }) => {
    const attachment = await api.uploadFile(
      userA.accessToken,
      { name: 'quarterly-plan.md', mimeType: 'text/markdown', buffer: Buffer.from('# Plan') },
      'Q4 planning file',
    );

    expect(attachment).toEqual(
      expect.objectContaining({
        fileName: 'quarterly-plan.md',
        contentType: 'text/markdown',
        sizeBytes: 6,
        comment: 'Q4 planning file',
      }),
    );
  });

  test('banned room user loses access to a previously visible room attachment', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const attachment = await api.uploadFile(
      userA.accessToken,
      { name: 'ban-check.txt', mimeType: 'text/plain', buffer: Buffer.from('revoked') },
    );
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);

    await chat.invoke('SendMessage', room.id, 'ban-sensitive attachment', null, attachment.id);
    await chat.stop();

    const beforeBanCtx = await api.authContext(userB.accessToken);
    expect((await beforeBanCtx.get(`/api/files/${attachment.id}`)).status()).toBe(200);
    await beforeBanCtx.dispose();

    await api.banMember(room.id, userB.id, userA.accessToken);

    const afterBanCtx = await api.authContext(userB.accessToken);
    expect((await afterBanCtx.get(`/api/files/${attachment.id}`)).status()).toBe(403);
    await afterBanCtx.dispose();
  });
});
