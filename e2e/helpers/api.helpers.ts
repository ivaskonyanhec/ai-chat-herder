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
    await ctx.dispose();

    return {
      id: body.user.id,
      email,
      password,
      username,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
    };
  }

  async login(email: string, password: string, keepSignedIn = true): Promise<TestUser> {
    const ctx = await this.context();
    const res = await ctx.post('/api/auth/login', {
      data: { email, password, keepSignedIn },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    await ctx.dispose();
    return {
      id: body.user.id,
      email,
      password,
      username: body.user.username,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
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

  async getMembers(roomId: string, accessToken: string): Promise<RoomMemberDto[]> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.get(`/api/rooms/${roomId}/members`);
    expect(res.status(), await res.text()).toBe(200);
    const members = await res.json();
    await ctx.dispose();
    return members;
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
