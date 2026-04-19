import { test, expect } from '../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../helpers/room.helpers';
import { createHubConnection } from '../helpers/signalr.helpers';

interface MessageDto {
  id: string;
  content: string | null;
  isDeleted?: boolean;
  replyToMessage?: { id: string } | null;
}

test.describe('Room message actions', () => {
  test('author can edit their own message and the response carries editedAt', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const original = `edit-original-${Date.now()}`;
    const updated  = `edit-updated-v2`;

    await chat.invoke('SendMessage', room.id, original, null, null);
    await chat.stop();

    const ownerCtx = await api.authContext(userA.accessToken);
    const history  = await ownerCtx.get(`/api/rooms/${room.id}/messages`);
    expect(history.status(), await history.text()).toBe(200);
    const messages = await history.json();
    const msg = messages.find((m: MessageDto) => m.content === original);
    if (!msg) throw new Error(`Message not found in history`);

    const edit = await ownerCtx.patch(`/api/messages/${msg.id}`, {
      data: { content: updated },
    });
    expect(edit.status(), await edit.text()).toBe(200);
    const body = await edit.json();
    expect(body.content).toBe(updated);
    expect(body.editedAt).toBeTruthy();
    await ownerCtx.dispose();
  });

  test('author deletes their own message and it appears as deleted in history', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `self-delete-${Date.now()}`;

    await chat.invoke('SendMessage', room.id, content, null, null);
    await chat.stop();

    const authorCtx = await api.authContext(userA.accessToken);
    const history   = await authorCtx.get(`/api/rooms/${room.id}/messages`);
    const messages  = await history.json();
    const msg = messages.find((m: MessageDto) => m.content === content);
    if (!msg) throw new Error(`Message not found in history`);

    const del = await authorCtx.delete(`/api/messages/${msg.id}`);
    expect(del.status(), await del.text()).toBe(204);
    await authorCtx.dispose();

    const memberCtx = await api.authContext(userB.accessToken);
    const after     = await memberCtx.get(`/api/rooms/${room.id}/messages`);
    const remaining = await after.json();
    const deleted   = remaining.find((m: { id: string }) => m.id === msg.id);
    expect(deleted).toMatchObject({ isDeleted: true, content: null });
    await memberCtx.dispose();
  });

  test('non-author cannot edit another user message and receives 403', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `not-yours-${Date.now()}`;

    await chat.invoke('SendMessage', room.id, content, null, null);
    await chat.stop();

    const ownerCtx = await api.authContext(userA.accessToken);
    const history  = await ownerCtx.get(`/api/rooms/${room.id}/messages`);
    const messages = await history.json();
    await ownerCtx.dispose();
    const msg = messages.find((m: MessageDto) => m.content === content);
    if (!msg) throw new Error(`Message not found in history`);

    const memberCtx = await api.authContext(userB.accessToken);
    const attempt   = await memberCtx.patch(`/api/messages/${msg.id}`, {
      data: { content: 'stolen edit' },
    });
    expect(attempt.status()).toBe(403);
    await memberCtx.dispose();
  });

  test('message reply is stored and appears with replyToMessageId in history', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chatA = await createHubConnection('/hubs/chat', userA.accessToken);
    const chatB = await createHubConnection('/hubs/chat', userB.accessToken);
    const original = `parent-msg-${Date.now()}`;
    const reply    = `reply-msg-${Date.now()}`;

    await chatA.invoke('SendMessage', room.id, original, null, null);

    const ctx       = await api.authContext(userA.accessToken);
    const history   = await ctx.get(`/api/rooms/${room.id}/messages`);
    const messages  = await history.json();
    const parentMsg = messages.find((m: MessageDto) => m.content === original);
    if (!parentMsg) throw new Error(`Parent message not found in history`);

    await chatB.invoke('SendMessage', room.id, reply, parentMsg.id, null);
    await chatA.stop();
    await chatB.stop();

    const after    = await ctx.get(`/api/rooms/${room.id}/messages`);
    const messages2 = await after.json();
    const replyMsg  = messages2.find((m: MessageDto) => m.content === reply);
    expect(replyMsg).toMatchObject({
      content: reply,
      replyToMessage: expect.objectContaining({ id: parentMsg.id }),
    });
    await ctx.dispose();
  });
});
