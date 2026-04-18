import { APIRequestContext, expect } from '@playwright/test';
import { ApiHelpers, RoomDto, TestUser } from './api.helpers';

export async function createPublicRoomWithMembers(
  api: ApiHelpers,
  owner: TestUser,
  members: TestUser[],
): Promise<RoomDto> {
  const room = await api.createRoom(owner.accessToken, { visibility: 'Public' });
  for (const member of members) {
    await api.joinPublicRoom(room.id, member.accessToken);
  }
  return room;
}

export async function expectRoomForbidden(ctx: APIRequestContext, roomId: string): Promise<void> {
  const res = await ctx.get(`/api/rooms/${roomId}/members`);
  expect(res.status()).toBe(403);
}
