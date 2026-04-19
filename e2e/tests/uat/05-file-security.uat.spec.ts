import { test, expect } from '../../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../../helpers/room.helpers';
import { createHubConnection } from '../../helpers/signalr.helpers';

test.describe('UAT: File security', () => {
  test('authorized participant can download an attachment', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const attachment = await api.uploadFile(
      userA.accessToken,
      { name: 'uat-file.txt', mimeType: 'text/plain', buffer: Buffer.from('uat authorized file') },
    );
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);

    await chat.invoke('SendMessage', room.id, 'uat file attachment', null, attachment.id);
    await chat.stop();

    const ctx = await api.authContext(userB.accessToken);
    const download = await ctx.get(`/api/files/${attachment.id}`);
    expect(download.status(), await download.text()).toBe(200);
    expect(await download.text()).toBe('uat authorized file');
    await ctx.dispose();
  });

  test('unauthorized user cannot download a direct attachment URL', async ({ api }) => {
    const owner = await api.register();
    const member = await api.register();
    const outsider = await api.register();
    const room = await createPublicRoomWithMembers(api, owner, [member]);
    const attachment = await api.uploadFile(
      owner.accessToken,
      { name: 'uat-private.txt', mimeType: 'text/plain', buffer: Buffer.from('uat private file') },
    );
    const chat = await createHubConnection('/hubs/chat', owner.accessToken);

    await chat.invoke('SendMessage', room.id, 'uat private attachment', null, attachment.id);
    await chat.stop();

    const ctx = await api.authContext(outsider.accessToken);
    const download = await ctx.get(`/api/files/${attachment.id}`);
    expect(download.status()).toBe(403);
    await ctx.dispose();
  });
});
