import { APIRequestContext, expect, request } from '@playwright/test';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  username: string;
  accessToken: string;
  refreshToken: string;
}

export interface RoomDto {
  id: string;
  name: string;
  description: string | null;
  visibility: 'Public' | 'Private' | string;
  ownerId: string;
  memberCount: number;
  callerRole: 'Owner' | 'Admin' | 'Member' | string | null;
}

export interface RoomMemberDto {
  userId: string;
  username: string;
  role: string;
  presenceStatus: string;
}

export interface RoomBanDto {
  bannedUserId: string;
  bannedUsername: string;
  bannedByUserId: string;
  bannedByUsername: string;
  reason: string | null;
}

export interface FriendRequestDto {
  id: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  receiverUsername: string;
  status: string;
  message: string | null;
}

export interface FriendDto {
  friendshipId: string;
  userId: string;
  username: string;
}

export interface BlockDto {
  blockedUserId: string;
  blockedUsername: string;
}

export interface DialogDto {
  id: string;
  otherUserId: string;
  otherUsername: string;
  isFrozen: boolean;
}

export interface DialogMessageDto {
  id: string;
  sequenceNumber: number;
  content: string | null;
  sender: { id: string; username: string };
  editedAt: string | null;
  isDeleted: boolean;
  attachment: AttachmentDto | null;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  comment: string | null;
}

export interface UnreadContextDto {
  contextType: 'room' | 'dialog' | string;
  contextId: string;
  count: number;
}

export interface PlatformBanDto {
  id: string;
  userId: string;
  username: string;
  issuedByAdminId: string;
  issuedByAdminUsername: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export class ApiHelpers {
  readonly baseUrl: string;

  constructor(baseUrl = process.env.BASE_URL ?? 'http://localhost') {
    this.baseUrl = baseUrl;
  }

  async register(overrides: Partial<Pick<TestUser, 'email' | 'password' | 'username'>> = {}): Promise<TestUser> {
    const ctx = await this.context();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = overrides.email ?? `e2e-${suffix}@test.local`;
    const password = overrides.password ?? 'Test@1234!E2E';
    const username = overrides.username ?? `user_${suffix}`;

    const reg = await ctx.post('/api/auth/register', {
      data: { email, password, username, keepSignedIn: true },
    });
    expect(reg.status(), await reg.text()).toBe(200);
    const body = await reg.json();
    const refreshToken = extractRefreshCookie(reg.headers()['set-cookie']);
    await ctx.dispose();

    return {
      id: body.user.id,
      email,
      password,
      username,
      accessToken: body.accessToken,
      refreshToken,
    };
  }

  async login(email: string, password: string, keepSignedIn = true): Promise<TestUser> {
    const ctx = await this.context();
    const res = await ctx.post('/api/auth/login', {
      data: { email, password, keepSignedIn },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    const refreshToken = extractRefreshCookie(res.headers()['set-cookie']);
    await ctx.dispose();
    return {
      id: body.user.id,
      email,
      password,
      username: body.user.username,
      accessToken: body.accessToken,
      refreshToken,
    };
  }

  async createRoom(
    accessToken: string,
    opts: { name?: string; description?: string; visibility?: 'Public' | 'Private' } = {},
  ): Promise<RoomDto> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.post('/api/rooms', {
      data: {
        name: opts.name ?? `e2e-room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        description: opts.description ?? 'E2E test room',
        visibility: opts.visibility ?? 'Public',
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const room = await res.json();
    await ctx.dispose();
    return room;
  }

  async joinPublicRoom(roomId: string, accessToken: string): Promise<void> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.post(`/api/rooms/${roomId}/join`);
    expect([204, 409], await res.text()).toContain(res.status());
    await ctx.dispose();
  }

  async joinRoom(accessToken: string, roomId: string): Promise<void> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.post(`/api/rooms/${roomId}/join`);
    if (res.status() !== 200 && res.status() !== 204 && res.status() !== 409) throw new Error(`joinRoom failed: ${res.status()} ${await res.text()}`);
    await ctx.dispose();
  }

  async banMember(roomId: string, userId: string, adminToken: string, reason = 'E2E ban'): Promise<void> {
    const ctx = await this.authContext(adminToken);
    const res = await ctx.post(`/api/rooms/${roomId}/members/${userId}/ban`, {
      data: { reason },
    });
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async makeAdmin(roomId: string, userId: string, ownerToken: string): Promise<void> {
    const ctx = await this.authContext(ownerToken);
    const res = await ctx.post(`/api/rooms/${roomId}/members/${userId}/make-admin`);
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async removeAdmin(roomId: string, userId: string, adminToken: string): Promise<void> {
    const ctx = await this.authContext(adminToken);
    const res = await ctx.delete(`/api/rooms/${roomId}/members/${userId}/admin`);
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async getRoomBans(roomId: string, accessToken: string): Promise<RoomBanDto[]> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.get(`/api/rooms/${roomId}/bans`);
    expect(res.status(), await res.text()).toBe(200);
    const bans = await res.json();
    await ctx.dispose();
    return bans;
  }

  async unbanMember(roomId: string, userId: string, adminToken: string): Promise<void> {
    const ctx = await this.authContext(adminToken);
    const res = await ctx.delete(`/api/rooms/${roomId}/bans/${userId}`);
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async getMembers(roomId: string, accessToken: string): Promise<RoomMemberDto[]> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.get(`/api/rooms/${roomId}/members`);
    expect(res.status(), await res.text()).toBe(200);
    const members = await res.json();
    await ctx.dispose();
    return members;
  }

  async sendFriendRequest(senderToken: string, username: string, message?: string): Promise<void> {
    const ctx = await this.authContext(senderToken);
    const res = await ctx.post('/api/friends/requests', {
      data: { username, message },
    });
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async getFriendRequests(accessToken: string): Promise<FriendRequestDto[]> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.get('/api/friends/requests');
    expect(res.status(), await res.text()).toBe(200);
    const requests = await res.json();
    await ctx.dispose();
    return requests;
  }

  async acceptFriendRequest(accessToken: string, requestId: string): Promise<void> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.post(`/api/friends/requests/${requestId}/accept`, { data: {} });
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async getFriends(accessToken: string): Promise<FriendDto[]> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.get('/api/friends');
    expect(res.status(), await res.text()).toBe(200);
    const friends = await res.json();
    await ctx.dispose();
    return friends;
  }

  async removeFriend(accessToken: string, userId: string): Promise<void> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.delete(`/api/friends/${userId}`);
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async createDialog(accessToken: string, userId: string): Promise<DialogDto> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.post('/api/dialogs', {
      data: { userId },
    });
    expect(res.status(), await res.text()).toBe(200);
    const dialog = await res.json();
    await ctx.dispose();
    return dialog;
  }

  async getDialog(accessToken: string, dialogId: string): Promise<DialogDto> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.get(`/api/dialogs/${dialogId}`);
    expect(res.status(), await res.text()).toBe(200);
    const dialog = await res.json();
    await ctx.dispose();
    return dialog;
  }

  async getDialogMessages(accessToken: string, dialogId: string): Promise<DialogMessageDto[]> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.get(`/api/dialogs/${dialogId}/messages?limit=100`);
    expect(res.status(), await res.text()).toBe(200);
    const messages = await res.json();
    await ctx.dispose();
    return messages;
  }

  async blockUser(accessToken: string, userId: string): Promise<void> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.post('/api/blocks', {
      data: { userId },
    });
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async getBlocks(accessToken: string): Promise<BlockDto[]> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.get('/api/blocks');
    expect(res.status(), await res.text()).toBe(200);
    const blocks = await res.json();
    await ctx.dispose();
    return blocks;
  }

  async unblockUser(accessToken: string, userId: string): Promise<void> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.delete(`/api/blocks/${userId}`);
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async uploadFile(
    accessToken: string,
    file: { name: string; mimeType: string; buffer: Buffer },
    comment?: string,
  ): Promise<AttachmentDto> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.post('/api/files/upload', {
      multipart: {
        file,
        ...(comment ? { comment } : {}),
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const attachment = await res.json();
    await ctx.dispose();
    return attachment;
  }

  async deleteAccount(accessToken: string): Promise<void> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.delete('/api/auth/account');
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async getUnreadCounts(accessToken: string): Promise<UnreadContextDto[]> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.get('/api/unread');
    expect(res.status(), await res.text()).toBe(200);
    const counts = await res.json();
    await ctx.dispose();
    return counts;
  }

  async getUnreadCount(accessToken: string, contextType: 'room' | 'dialog', contextId: string): Promise<number> {
    const counts = await this.getUnreadCounts(accessToken);
    return counts.find(c => c.contextType === contextType && c.contextId === contextId)?.count ?? 0;
  }

  async markRoomRead(accessToken: string, roomId: string): Promise<void> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.post(`/api/rooms/${roomId}/read`);
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async markDialogRead(accessToken: string, dialogId: string): Promise<void> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.post(`/api/dialogs/${dialogId}/read`);
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async issuePlatformBan(adminToken: string, username: string, reason: string, durationHours?: number): Promise<void> {
    const ctx = await this.authContext(adminToken);
    const res = await ctx.post('/api/admin/bans', {
      data: { username, reason, durationHours },
    });
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async revokePlatformBan(adminToken: string, userId: string): Promise<void> {
    const ctx = await this.authContext(adminToken);
    const res = await ctx.delete(`/api/admin/bans/${userId}`);
    expect(res.status(), await res.text()).toBe(204);
    await ctx.dispose();
  }

  async getPlatformBans(adminToken: string): Promise<PlatformBanDto[]> {
    const ctx = await this.authContext(adminToken);
    const res = await ctx.get('/api/admin/bans');
    expect(res.status(), await res.text()).toBe(200);
    const bans = await res.json();
    await ctx.dispose();
    return bans;
  }

  async context(): Promise<APIRequestContext> {
    return request.newContext({ baseURL: this.baseUrl });
  }

  async authContext(accessToken: string): Promise<APIRequestContext> {
    return request.newContext({
      baseURL: this.baseUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
    });
  }
}

function extractRefreshCookie(setCookie: string | undefined): string {
  const cookie = setCookie
    ?.split(/,(?=\s*chat_herder_refresh=)/)
    .find(part => part.trimStart().startsWith('chat_herder_refresh='));
  const value = cookie?.trim().split(';')[0]?.split('=')[1];
  expect(value, 'chat_herder_refresh Set-Cookie value').toBeTruthy();
  return decodeURIComponent(value!);
}
