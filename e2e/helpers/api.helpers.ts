import { APIRequestContext, request } from '@playwright/test';

export interface TestUser {
  id:           string;
  email:        string;
  password:     string;
  username:     string;
  accessToken:  string;
  refreshToken: string;
}

export interface RoomDto {
  id:   string;
  name: string;
}

export class ApiHelpers {
  readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.BASE_URL ?? 'http://localhost';
  }

  // ─── Auth ────────────────────────────────────────────────────────────────────

  async register(): Promise<TestUser> {
    const ctx      = await this.context();
    const suffix   = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const email    = `e2e-${suffix}@test.local`;
    const password = 'Test@1234!E2E';
    const username = `user_${suffix}`;

    const reg = await ctx.post('/api/auth/register', {
      data: { email, password, username },
    });
    if (!reg.ok()) throw new Error(`register failed (${reg.status()}): ${await reg.text()}`);

    const login = await ctx.post('/api/auth/login', {
      data: { email, password },
    });
    if (!login.ok()) throw new Error(`login failed (${login.status()}): ${await login.text()}`);

    const body = await login.json();
    await ctx.dispose();

    return {
      id:           body.user.id,
      email,
      password,
      username,
      accessToken:  body.accessToken,
      refreshToken: body.refreshToken,
    };
  }

  // ─── Rooms ───────────────────────────────────────────────────────────────────

  async createRoom(
    accessToken: string,
    opts: { name?: string; isPublic?: boolean } = {},
  ): Promise<RoomDto> {
    const ctx = await this.authContext(accessToken);
    const res = await ctx.post('/api/rooms', {
      data: {
        name:       opts.name ?? `e2e-room-${Date.now()}`,
        topic:      'E2E test room',
        isPublic:   opts.isPublic ?? true,
        maxMembers: 50,
      },
    });
    if (!res.ok()) throw new Error(`createRoom failed (${res.status()}): ${await res.text()}`);
    const room = await res.json();
    await ctx.dispose();
    return room;
  }

  async addMember(roomId: string, userId: string, adminToken: string): Promise<void> {
    const ctx = await this.authContext(adminToken);
    const res = await ctx.post(`/api/rooms/${roomId}/members/${userId}`);
    if (!res.ok()) throw new Error(`addMember failed (${res.status()}): ${await res.text()}`);
    await ctx.dispose();
  }

  async banMember(roomId: string, userId: string, adminToken: string): Promise<void> {
    const ctx = await this.authContext(adminToken);
    // DELETE /api/rooms/{roomId}/members/{userId} acts as a room ban (AGENT.md §9)
    const res = await ctx.delete(`/api/rooms/${roomId}/members/${userId}`);
    if (!res.ok()) throw new Error(`banMember failed (${res.status()}): ${await res.text()}`);
    await ctx.dispose();
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private async context(): Promise<APIRequestContext> {
    return request.newContext({ baseURL: this.baseUrl });
  }

  private async authContext(accessToken: string): Promise<APIRequestContext> {
    return request.newContext({
      baseURL: this.baseUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
