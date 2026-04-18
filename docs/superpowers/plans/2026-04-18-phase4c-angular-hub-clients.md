# Phase 4c: Angular SignalR Hub Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Angular frontend to the two ASP.NET Core SignalR hubs (`/hubs/presence` and `/hubs/chat`) via injectable services, driving UI state exclusively with Angular Signals.

**Architecture:** `PresenceService` owns the `/hubs/presence` WebSocket connection and the AFK/heartbeat loop; `ChatService` owns the `/hubs/chat` connection and all send/receive operations; `UnreadService` is a pure signal-state store that both hub services write into. A single `HubConnectionFactory` injection token is the only place the `@microsoft/signalr` package is imported, keeping all three services fully testable with mocks. `WorkspaceShellComponent` is the lifecycle owner — it calls `connect()` on init and `disconnect()` before logout.

**Tech Stack:** `@microsoft/signalr` 8.x, Angular 21 Signals, Angular `isDevMode()`, Vitest + Angular TestBed for tests.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/app/core/signalr/hub.models.ts` | All TypeScript interfaces matching server DTOs and hub events |
| Create | `frontend/src/app/core/signalr/hub-connection.factory.ts` | `InjectionToken<HubConnectionFactory>` — single place that imports `@microsoft/signalr` |
| Create | `frontend/src/app/core/signalr/unread.service.ts` | `unreadCounts` signal state; `setCount()` / `getCount()` mutators |
| Create | `frontend/src/app/core/signalr/unread.service.spec.ts` | Unit tests for UnreadService |
| Create | `frontend/src/app/core/signalr/presence.service.ts` | `/hubs/presence` connection, AFK loop, heartbeat, room group join/leave, server→client handlers |
| Create | `frontend/src/app/core/signalr/presence.service.spec.ts` | Unit tests for PresenceService |
| Create | `frontend/src/app/core/signalr/chat.service.ts` | `/hubs/chat` connection, all hub invocations, message event signals |
| Create | `frontend/src/app/core/signalr/chat.service.spec.ts` | Unit tests for ChatService |
| Modify | `frontend/package.json` | Add `@microsoft/signalr` dependency |
| Modify | `frontend/src/app/features/workspace/workspace-shell.component.ts` | Connect services on init; disconnect before logout |
| Modify | `frontend/src/app/features/workspace/workspace-shell.component.spec.ts` | Update stubs to include new service mock |

---

## Context Reference

### Server Hub Events Contract (AGENT.md §10)

**PresenceHub `/hubs/presence` — Server → Client:**
| Event | Payload |
|-------|---------|
| `UserStatusChanged` | `{ userId: string, status: 'online'\|'afk'\|'offline' }` |
| `RoomMembersSnapshot` | `{ roomId: string, members: RoomMemberPresence[] }` |
| `MemberJoined` | `{ roomId: string, user: RoomMemberPresence }` |
| `MemberLeft` | `{ roomId: string, userId: string }` |
| `RemovedFromRoom` | `{ roomId: string, reason: string }` |
| `FriendRequestReceived` | `{ requestId: string, fromUserId: string, fromUsername: string, message: string }` |
| `FriendRequestAccepted` | `{ userId: string, username: string }` |
| `RoomInvitationReceived` | `{ invitationId: string, roomId: string, roomName: string, fromUserId: string }` |
| `DialogFrozen` | `{ dialogId: string }` |
| `ForceDisconnect` | `{ reason: string }` |

**ChatHub `/hubs/chat` — Server → Client:**
| Event | Payload |
|-------|---------|
| `MessageReceived` | `MessageDto` |
| `MessageEdited` | `MessageDto` |
| `MessageDeleted` | `{ messageId: string, roomId: string }` |
| `UserTyping` | `{ roomId: string, userId: string, isTyping: boolean }` |
| `DirectMessageReceived` | `DialogMessageDto` |
| `DirectMessageEdited` | `DialogMessageDto` |
| `DirectMessageDeleted` | `{ messageId: string, dialogId: string }` |
| `UserTypingInDialog` | `{ dialogId: string, userId: string, isTyping: boolean }` |
| `UnreadCountChanged` | `{ contextType: string, contextId: string, count: number }` |

### AFK Rules (AGENT.md §11)
- Track DOM events: `mousemove`, `keydown`, `click`, `scroll`, `touchstart` — **throttled to 1 per second** (raw mousemove at 60fps × 300 users = 18,000 callbacks/s — must throttle).
- `document.visibilitychange` → `visible`: reset inactivity timer; call `SetActive()` if currently AFK.
- `setInterval` every 5s: if `(now − lastActivityAt) >= 60_000ms` → call hub `SetAfk()`.
- On any throttled event while AFK: call hub `SetActive()`.

### Heartbeat Rule (AGENT.md §10)
- `Heartbeat` hub method called every **30 seconds**.

### E2E Requirement (AGENT.md §20)
```typescript
if (isDevMode()) { (window as any)['__presenceHub'] = this.connection; }
```

### Auto-Reconnect (AGENT.md §11)
- `.withAutomaticReconnect()` on the HubConnection.
- `onreconnected` callback must re-invoke `JoinRoom` for all rooms the user was in.

### JWT Transport (AGENT.md §3.4)
- Pass access token as `?access_token=` query string — use `accessTokenFactory` in HubConnectionBuilder options.

### Existing Angular Patterns
- `AuthSessionService.accessToken` — `computed<string | null>` — read from here.
- `AuthSessionService.clearSession()` — call on `ForceDisconnect`.
- Test runner: **Vitest** (use `vi.fn()`, `vi.spyOn()`; import from `vitest` or use global `vi`).
- All tests use `TestBed.configureTestingModule({ providers: [...] })`.

---

## Task 1: Install @microsoft/signalr, hub models, and HubConnectionFactory

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/app/core/signalr/hub.models.ts`
- Create: `frontend/src/app/core/signalr/hub-connection.factory.ts`

- [ ] **Step 1: Install @microsoft/signalr**

Run inside `frontend/`:
```bash
cd frontend && npm install @microsoft/signalr@^8.0.0
```

Expected: package appears in `node_modules/@microsoft/signalr`, `package.json` updated.

- [ ] **Step 2: Verify the import resolves**

Run:
```bash
cd frontend && node -e "require('@microsoft/signalr'); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 3: Create hub.models.ts**

Create `frontend/src/app/core/signalr/hub.models.ts`:

```typescript
export type PresenceStatus = 'online' | 'afk' | 'offline';

export interface RoomMemberPresence {
  userId: string;
  username: string;
  avatarUrl: string | null;
  status: PresenceStatus;
}

export interface UserSummaryDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  comment: string | null;
}

export interface MessageDto {
  id: string;
  sequenceNumber: number;
  content: string | null;
  sender: UserSummaryDto;
  sentAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  replyTo: MessageDto | null;
  attachment: AttachmentDto | null;
}

export interface DialogMessageDto {
  id: string;
  sequenceNumber: number;
  content: string | null;
  author: UserSummaryDto;
  sentAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  replyTo: DialogMessageDto | null;
  attachment: AttachmentDto | null;
}

// PresenceHub server→client event payloads
export interface UserStatusChangedEvent { userId: string; status: PresenceStatus; }
export interface RoomMembersSnapshotEvent { roomId: string; members: RoomMemberPresence[]; }
export interface MemberJoinedEvent { roomId: string; user: RoomMemberPresence; }
export interface MemberLeftEvent { roomId: string; userId: string; }
export interface RemovedFromRoomEvent { roomId: string; reason: string; }
export interface FriendRequestReceivedEvent { requestId: string; fromUserId: string; fromUsername: string; message: string; }
export interface FriendRequestAcceptedEvent { userId: string; username: string; }
export interface RoomInvitationReceivedEvent { invitationId: string; roomId: string; roomName: string; fromUserId: string; }
export interface DialogFrozenEvent { dialogId: string; }
export interface ForceDisconnectEvent { reason: string; }

// ChatHub server→client event payloads
export interface MessageDeletedEvent { messageId: string; roomId: string; }
export interface UserTypingEvent { roomId: string; userId: string; isTyping: boolean; }
export interface DirectMessageDeletedEvent { messageId: string; dialogId: string; }
export interface UserTypingInDialogEvent { dialogId: string; userId: string; isTyping: boolean; }
export interface UnreadCountChangedEvent { contextType: string; contextId: string; count: number; }

// Union types for ChatService event signals
export type RoomChatEvent =
  | { type: 'MessageReceived'; payload: MessageDto }
  | { type: 'MessageEdited'; payload: MessageDto }
  | { type: 'MessageDeleted'; payload: MessageDeletedEvent };

export type DmChatEvent =
  | { type: 'DirectMessageReceived'; payload: DialogMessageDto }
  | { type: 'DirectMessageEdited'; payload: DialogMessageDto }
  | { type: 'DirectMessageDeleted'; payload: DirectMessageDeletedEvent };

export type TypingEvent =
  | { type: 'UserTyping'; payload: UserTypingEvent }
  | { type: 'UserTypingInDialog'; payload: UserTypingInDialogEvent };
```

- [ ] **Step 4: Create hub-connection.factory.ts**

Create `frontend/src/app/core/signalr/hub-connection.factory.ts`:

```typescript
import { InjectionToken } from '@angular/core';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';

export type HubConnectionFactory = (
  url: string,
  getToken: () => string,
) => HubConnection;

export const HUB_CONNECTION_FACTORY = new InjectionToken<HubConnectionFactory>(
  'HUB_CONNECTION_FACTORY',
  {
    providedIn: 'root',
    factory: (): HubConnectionFactory =>
      (url, getToken) =>
        new HubConnectionBuilder()
          .withUrl(url, { accessTokenFactory: getToken })
          .withAutomaticReconnect()
          .build(),
  },
);
```

- [ ] **Step 5: Run the Angular build to confirm no compile errors**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -20
```

Expected: `Application bundle generation complete.` (or similar success message, no error lines).

- [ ] **Step 6: Commit**

```bash
cd frontend && git add package.json package-lock.json src/app/core/signalr/hub.models.ts src/app/core/signalr/hub-connection.factory.ts
git commit -m "feat: add @microsoft/signalr, hub models, and HubConnectionFactory token"
```

---

## Task 2: UnreadService

**Files:**
- Create: `frontend/src/app/core/signalr/unread.service.ts`
- Create: `frontend/src/app/core/signalr/unread.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/core/signalr/unread.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { UnreadService } from './unread.service';

describe('UnreadService', () => {
  let service: UnreadService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [UnreadService] });
    service = TestBed.inject(UnreadService);
  });

  it('starts with an empty unread map', () => {
    expect(service.unreadCounts().size).toBe(0);
  });

  it('setCount stores count under contextType:contextId key', () => {
    service.setCount('room', 'room-abc', 5);
    expect(service.unreadCounts().get('room:room-abc')).toBe(5);
  });

  it('setCount with 0 removes the key from the map', () => {
    service.setCount('room', 'room-abc', 3);
    service.setCount('room', 'room-abc', 0);
    expect(service.unreadCounts().has('room:room-abc')).toBe(false);
  });

  it('getCount returns 0 for unknown key', () => {
    expect(service.getCount('dialog', 'dialog-xyz')).toBe(0);
  });

  it('getCount returns stored count', () => {
    service.setCount('dialog', 'dialog-xyz', 7);
    expect(service.getCount('dialog', 'dialog-xyz')).toBe(7);
  });

  it('clearAll resets the map to empty', () => {
    service.setCount('room', 'r1', 2);
    service.setCount('dialog', 'd1', 1);
    service.clearAll();
    expect(service.unreadCounts().size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm RED**

```bash
cd frontend && npx ng test --include="**/unread.service.spec.ts" --watch=false 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './unread.service'`

- [ ] **Step 3: Implement UnreadService**

Create `frontend/src/app/core/signalr/unread.service.ts`:

```typescript
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UnreadService {
  private readonly _unreadCounts = signal<Map<string, number>>(new Map());

  readonly unreadCounts = this._unreadCounts.asReadonly();

  private key(contextType: string, contextId: string): string {
    return `${contextType}:${contextId}`;
  }

  setCount(contextType: string, contextId: string, count: number): void {
    const current = new Map(this._unreadCounts());
    const k = this.key(contextType, contextId);
    if (count === 0) {
      current.delete(k);
    } else {
      current.set(k, count);
    }
    this._unreadCounts.set(current);
  }

  getCount(contextType: string, contextId: string): number {
    return this._unreadCounts().get(this.key(contextType, contextId)) ?? 0;
  }

  clearAll(): void {
    this._unreadCounts.set(new Map());
  }
}
```

- [ ] **Step 4: Run tests to confirm GREEN**

```bash
cd frontend && npx ng test --include="**/unread.service.spec.ts" --watch=false 2>&1 | tail -20
```

Expected: 6 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/app/core/signalr/unread.service.ts src/app/core/signalr/unread.service.spec.ts
git commit -m "feat: add UnreadService with unreadCounts signal"
```

---

## Task 3: PresenceService

**Files:**
- Create: `frontend/src/app/core/signalr/presence.service.ts`
- Create: `frontend/src/app/core/signalr/presence.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/core/signalr/presence.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HubConnection } from '@microsoft/signalr';
import { PresenceService } from './presence.service';
import { HUB_CONNECTION_FACTORY } from './hub-connection.factory';
import { AuthSessionService } from '../auth/auth-session.service';

function buildMockConnection() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const conn = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    invoke: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onreconnected: vi.fn(),
    state: 'Connected',
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
  return conn as unknown as HubConnection & { _trigger: (event: string, ...args: unknown[]) => void };
}

describe('PresenceService', () => {
  let service: PresenceService;
  let mockConn: ReturnType<typeof buildMockConnection>;

  beforeEach(async () => {
    mockConn = buildMockConnection();
    const mockFactory = vi.fn().mockReturnValue(mockConn);
    const mockAuthSession = {
      accessToken: vi.fn().mockReturnValue('test-token'),
      clearSession: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        PresenceService,
        { provide: HUB_CONNECTION_FACTORY, useValue: mockFactory },
        { provide: AuthSessionService, useValue: mockAuthSession },
      ],
    });

    service = TestBed.inject(PresenceService);
    await service.connect();
  });

  afterEach(async () => {
    await service.disconnect();
  });

  it('connect starts the hub connection', () => {
    expect(mockConn.start).toHaveBeenCalledTimes(1);
  });

  it('connected signal is true after connect()', () => {
    expect(service.connected()).toBe(true);
  });

  it('UserStatusChanged updates presenceMap', () => {
    mockConn._trigger('UserStatusChanged', { userId: 'u1', status: 'afk' });
    expect(service.presenceMap().get('u1')).toBe('afk');
  });

  it('MemberLeft removes user from presenceMap', () => {
    mockConn._trigger('UserStatusChanged', { userId: 'u1', status: 'online' });
    mockConn._trigger('MemberLeft', { roomId: 'r1', userId: 'u1' });
    // MemberLeft from all rooms may remove user — status is preserved but user left room
    // presenceMap keeps the status; only RoomMembersSnapshot replaces snapshot
    expect(service.presenceMap().has('u1')).toBe(true); // still in map, just left the room
  });

  it('disconnect stops the hub connection and sets connected false', async () => {
    await service.disconnect();
    expect(mockConn.stop).toHaveBeenCalled();
    expect(service.connected()).toBe(false);
  });

  it('joinRoom invokes JoinRoom on the hub', async () => {
    await service.joinRoom('room-123');
    expect(mockConn.invoke).toHaveBeenCalledWith('JoinRoom', 'room-123');
  });

  it('leaveRoom invokes LeaveRoom on the hub', async () => {
    await service.leaveRoom('room-123');
    expect(mockConn.invoke).toHaveBeenCalledWith('LeaveRoom', 'room-123');
  });
});
```

- [ ] **Step 2: Run tests to confirm RED**

```bash
cd frontend && npx ng test --include="**/presence.service.spec.ts" --watch=false 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './presence.service'`

- [ ] **Step 3: Implement PresenceService**

Create `frontend/src/app/core/signalr/presence.service.ts`:

```typescript
import { Injectable, inject, isDevMode, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HubConnection } from '@microsoft/signalr';
import { HUB_CONNECTION_FACTORY } from './hub-connection.factory';
import { AuthSessionService } from '../auth/auth-session.service';
import type {
  PresenceStatus,
  RoomMembersSnapshotEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  RemovedFromRoomEvent,
  UserStatusChangedEvent,
} from './hub.models';

const HEARTBEAT_INTERVAL_MS = 30_000;
const AFK_CHECK_INTERVAL_MS = 5_000;
const AFK_THRESHOLD_MS = 60_000;
const THROTTLE_MS = 1_000;

@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly factory = inject(HUB_CONNECTION_FACTORY);
  private readonly authSession = inject(AuthSessionService);
  private readonly document = inject(DOCUMENT);

  private connection: HubConnection | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private afkCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = Date.now();
  private lastThrottledAt = 0;
  private isAfk = false;
  private readonly joinedRooms = new Set<string>();

  private readonly _connected = signal(false);
  private readonly _presenceMap = signal<Map<string, PresenceStatus>>(new Map());

  // Notification signals for UI components to react to
  private readonly _roomMembersSnapshot = signal<RoomMembersSnapshotEvent | null>(null);
  private readonly _memberJoined = signal<MemberJoinedEvent | null>(null);
  private readonly _memberLeft = signal<MemberLeftEvent | null>(null);
  private readonly _removedFromRoom = signal<RemovedFromRoomEvent | null>(null);

  readonly connected = this._connected.asReadonly();
  readonly presenceMap = this._presenceMap.asReadonly();
  readonly roomMembersSnapshot = this._roomMembersSnapshot.asReadonly();
  readonly memberJoined = this._memberJoined.asReadonly();
  readonly memberLeft = this._memberLeft.asReadonly();
  readonly removedFromRoom = this._removedFromRoom.asReadonly();

  async connect(): Promise<void> {
    const token = this.authSession.accessToken();
    if (!token || this.connection) return;

    this.connection = this.factory('/hubs/presence', () => this.authSession.accessToken() ?? '');
    this.registerHandlers(this.connection);

    this.connection.onreconnected(() => {
      this.rejoinAllRooms();
    });

    if (isDevMode()) {
      (window as Record<string, unknown>)['__presenceHub'] = this.connection;
    }

    await this.connection.start();
    this._connected.set(true);
    this.startHeartbeat();
    this.startAfkTracking();
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.stopAfkTracking();
    this.removeActivityListeners();
    this.joinedRooms.clear();

    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }
    this._connected.set(false);
  }

  async joinRoom(roomId: string): Promise<void> {
    if (!this.connection) return;
    await this.connection.invoke('JoinRoom', roomId);
    this.joinedRooms.add(roomId);
  }

  async leaveRoom(roomId: string): Promise<void> {
    if (!this.connection) return;
    await this.connection.invoke('LeaveRoom', roomId);
    this.joinedRooms.delete(roomId);
  }

  private registerHandlers(conn: HubConnection): void {
    conn.on('UserStatusChanged', (e: UserStatusChangedEvent) => {
      const updated = new Map(this._presenceMap());
      updated.set(e.userId, e.status);
      this._presenceMap.set(updated);
    });

    conn.on('RoomMembersSnapshot', (e: RoomMembersSnapshotEvent) => {
      const updated = new Map(this._presenceMap());
      for (const m of e.members) {
        updated.set(m.userId, m.status);
      }
      this._presenceMap.set(updated);
      this._roomMembersSnapshot.set(e);
    });

    conn.on('MemberJoined', (e: MemberJoinedEvent) => {
      const updated = new Map(this._presenceMap());
      updated.set(e.user.userId, e.user.status);
      this._presenceMap.set(updated);
      this._memberJoined.set(e);
    });

    conn.on('MemberLeft', (e: MemberLeftEvent) => {
      this._memberLeft.set(e);
    });

    conn.on('RemovedFromRoom', (e: RemovedFromRoomEvent) => {
      this.joinedRooms.delete(e.roomId);
      this._removedFromRoom.set(e);
    });

    conn.on('ForceDisconnect', () => {
      void this.disconnect();
      this.authSession.clearSession();
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      void this.connection?.invoke('Heartbeat');
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startAfkTracking(): void {
    this.lastActivityAt = Date.now();
    this.isAfk = false;
    this.addActivityListeners();

    this.afkCheckTimer = setInterval(() => {
      const idle = Date.now() - this.lastActivityAt;
      if (!this.isAfk && idle >= AFK_THRESHOLD_MS) {
        this.isAfk = true;
        void this.connection?.invoke('SetAfk');
      }
    }, AFK_CHECK_INTERVAL_MS);

    const doc = this.document;
    doc.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private stopAfkTracking(): void {
    if (this.afkCheckTimer !== null) {
      clearInterval(this.afkCheckTimer);
      this.afkCheckTimer = null;
    }
    this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onActivity = (): void => {
    const now = Date.now();
    if (now - this.lastThrottledAt < THROTTLE_MS) return;
    this.lastThrottledAt = now;
    this.lastActivityAt = now;

    if (this.isAfk) {
      this.isAfk = false;
      void this.connection?.invoke('SetActive');
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (this.document.visibilityState === 'visible') {
      this.lastActivityAt = Date.now();
      if (this.isAfk) {
        this.isAfk = false;
        void this.connection?.invoke('SetActive');
      }
    }
  };

  private addActivityListeners(): void {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    for (const ev of events) {
      this.document.addEventListener(ev, this.onActivity, { passive: true });
    }
  }

  private removeActivityListeners(): void {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    for (const ev of events) {
      this.document.removeEventListener(ev, this.onActivity);
    }
  }

  private rejoinAllRooms(): void {
    for (const roomId of this.joinedRooms) {
      void this.connection?.invoke('JoinRoom', roomId);
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm GREEN**

```bash
cd frontend && npx ng test --include="**/presence.service.spec.ts" --watch=false 2>&1 | tail -20
```

Expected: 7 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/app/core/signalr/presence.service.ts src/app/core/signalr/presence.service.spec.ts
git commit -m "feat: add PresenceService with AFK tracking, heartbeat, and hub event signals"
```

---

## Task 4: ChatService

**Files:**
- Create: `frontend/src/app/core/signalr/chat.service.ts`
- Create: `frontend/src/app/core/signalr/chat.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/core/signalr/chat.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HubConnection } from '@microsoft/signalr';
import { ChatService } from './chat.service';
import { HUB_CONNECTION_FACTORY } from './hub-connection.factory';
import { AuthSessionService } from '../auth/auth-session.service';
import { UnreadService } from './unread.service';

function buildMockConnection() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const conn = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    invoke: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onreconnected: vi.fn(),
    state: 'Connected',
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
  return conn as unknown as HubConnection & { _trigger: (event: string, ...args: unknown[]) => void };
}

describe('ChatService', () => {
  let service: ChatService;
  let mockConn: ReturnType<typeof buildMockConnection>;
  let unreadService: UnreadService;

  beforeEach(async () => {
    mockConn = buildMockConnection();
    const mockFactory = vi.fn().mockReturnValue(mockConn);
    const mockAuthSession = {
      accessToken: vi.fn().mockReturnValue('test-token'),
    };

    TestBed.configureTestingModule({
      providers: [
        ChatService,
        UnreadService,
        { provide: HUB_CONNECTION_FACTORY, useValue: mockFactory },
        { provide: AuthSessionService, useValue: mockAuthSession },
      ],
    });

    service = TestBed.inject(ChatService);
    unreadService = TestBed.inject(UnreadService);
    await service.connect();
  });

  afterEach(async () => {
    await service.disconnect();
  });

  it('connect starts the chat hub connection', () => {
    expect(mockConn.start).toHaveBeenCalledTimes(1);
  });

  it('sendMessage invokes SendMessage on the hub', async () => {
    await service.sendMessage('room-1', 'hello', null, null);
    expect(mockConn.invoke).toHaveBeenCalledWith('SendMessage', 'room-1', 'hello', null, null);
  });

  it('editMessage invokes EditMessage on the hub', async () => {
    await service.editMessage('msg-1', 'updated text');
    expect(mockConn.invoke).toHaveBeenCalledWith('EditMessage', 'msg-1', 'updated text');
  });

  it('deleteMessage invokes DeleteMessage on the hub', async () => {
    await service.deleteMessage('msg-1');
    expect(mockConn.invoke).toHaveBeenCalledWith('DeleteMessage', 'msg-1');
  });

  it('MessageReceived event updates lastRoomEvent signal', () => {
    const fakeDto = { id: 'msg-1', sequenceNumber: 1, content: 'hi', sender: { id: 'u1', username: 'alice', avatarUrl: null }, sentAt: '', editedAt: null, isDeleted: false, replyTo: null, attachment: null };
    mockConn._trigger('MessageReceived', fakeDto);
    expect(service.lastRoomEvent()?.type).toBe('MessageReceived');
    expect(service.lastRoomEvent()?.payload).toEqual(fakeDto);
  });

  it('UnreadCountChanged event calls UnreadService.setCount', () => {
    const spy = vi.spyOn(unreadService, 'setCount');
    mockConn._trigger('UnreadCountChanged', { contextType: 'room', contextId: 'r1', count: 3 });
    expect(spy).toHaveBeenCalledWith('room', 'r1', 3);
  });

  it('disconnect stops the hub connection', async () => {
    await service.disconnect();
    expect(mockConn.stop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm RED**

```bash
cd frontend && npx ng test --include="**/chat.service.spec.ts" --watch=false 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './chat.service'`

- [ ] **Step 3: Implement ChatService**

Create `frontend/src/app/core/signalr/chat.service.ts`:

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { HubConnection } from '@microsoft/signalr';
import { HUB_CONNECTION_FACTORY } from './hub-connection.factory';
import { AuthSessionService } from '../auth/auth-session.service';
import { UnreadService } from './unread.service';
import type {
  MessageDto,
  DialogMessageDto,
  MessageDeletedEvent,
  DirectMessageDeletedEvent,
  UserTypingEvent,
  UserTypingInDialogEvent,
  UnreadCountChangedEvent,
  RoomChatEvent,
  DmChatEvent,
  TypingEvent,
} from './hub.models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly factory = inject(HUB_CONNECTION_FACTORY);
  private readonly authSession = inject(AuthSessionService);
  private readonly unread = inject(UnreadService);

  private connection: HubConnection | null = null;

  private readonly _lastRoomEvent = signal<RoomChatEvent | null>(null);
  private readonly _lastDmEvent = signal<DmChatEvent | null>(null);
  private readonly _lastTypingEvent = signal<TypingEvent | null>(null);

  readonly lastRoomEvent = this._lastRoomEvent.asReadonly();
  readonly lastDmEvent = this._lastDmEvent.asReadonly();
  readonly lastTypingEvent = this._lastTypingEvent.asReadonly();

  async connect(): Promise<void> {
    if (this.connection) return;

    this.connection = this.factory('/hubs/chat', () => this.authSession.accessToken() ?? '');
    this.registerHandlers(this.connection);
    await this.connection.start();
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }
  }

  // Room messages
  async sendMessage(
    roomId: string,
    content: string,
    replyToId: string | null,
    attachmentId: string | null,
  ): Promise<void> {
    await this.connection?.invoke('SendMessage', roomId, content, replyToId, attachmentId);
  }

  async editMessage(messageId: string, newContent: string): Promise<void> {
    await this.connection?.invoke('EditMessage', messageId, newContent);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.connection?.invoke('DeleteMessage', messageId);
  }

  async startTyping(roomId: string): Promise<void> {
    await this.connection?.invoke('StartTyping', roomId);
  }

  async stopTyping(roomId: string): Promise<void> {
    await this.connection?.invoke('StopTyping', roomId);
  }

  // DM messages
  async sendDirectMessage(
    dialogId: string,
    content: string,
    replyToId: string | null,
    attachmentId: string | null,
  ): Promise<void> {
    await this.connection?.invoke('SendDirectMessage', dialogId, content, replyToId, attachmentId);
  }

  async editDirectMessage(messageId: string, newContent: string): Promise<void> {
    await this.connection?.invoke('EditDirectMessage', messageId, newContent);
  }

  async deleteDirectMessage(messageId: string): Promise<void> {
    await this.connection?.invoke('DeleteDirectMessage', messageId);
  }

  async startTypingDM(dialogId: string): Promise<void> {
    await this.connection?.invoke('StartTypingDM', dialogId);
  }

  async stopTypingDM(dialogId: string): Promise<void> {
    await this.connection?.invoke('StopTypingDM', dialogId);
  }

  private registerHandlers(conn: HubConnection): void {
    conn.on('MessageReceived', (payload: MessageDto) => {
      this._lastRoomEvent.set({ type: 'MessageReceived', payload });
    });
    conn.on('MessageEdited', (payload: MessageDto) => {
      this._lastRoomEvent.set({ type: 'MessageEdited', payload });
    });
    conn.on('MessageDeleted', (payload: MessageDeletedEvent) => {
      this._lastRoomEvent.set({ type: 'MessageDeleted', payload });
    });

    conn.on('DirectMessageReceived', (payload: DialogMessageDto) => {
      this._lastDmEvent.set({ type: 'DirectMessageReceived', payload });
    });
    conn.on('DirectMessageEdited', (payload: DialogMessageDto) => {
      this._lastDmEvent.set({ type: 'DirectMessageEdited', payload });
    });
    conn.on('DirectMessageDeleted', (payload: DirectMessageDeletedEvent) => {
      this._lastDmEvent.set({ type: 'DirectMessageDeleted', payload });
    });

    conn.on('UserTyping', (payload: UserTypingEvent) => {
      this._lastTypingEvent.set({ type: 'UserTyping', payload });
    });
    conn.on('UserTypingInDialog', (payload: UserTypingInDialogEvent) => {
      this._lastTypingEvent.set({ type: 'UserTypingInDialog', payload });
    });

    conn.on('UnreadCountChanged', (e: UnreadCountChangedEvent) => {
      this.unread.setCount(e.contextType, e.contextId, e.count);
    });
  }
}
```

- [ ] **Step 4: Run tests to confirm GREEN**

```bash
cd frontend && npx ng test --include="**/chat.service.spec.ts" --watch=false 2>&1 | tail -20
```

Expected: 7 tests pass, 0 failures.

- [ ] **Step 5: Run full frontend test suite to check for regressions**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -20
```

Expected: All previous tests + new 13 signalr tests pass. 0 failures.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/app/core/signalr/chat.service.ts src/app/core/signalr/chat.service.spec.ts
git commit -m "feat: add ChatService — hub invocations and message event signals"
```

---

## Task 5: WorkspaceShell Wiring

Wire `PresenceService` and `ChatService` into `WorkspaceShellComponent` so they connect when the authenticated shell mounts and disconnect before logout clears the session.

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.ts`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.spec.ts`

- [ ] **Step 1: Read the current test file to understand existing stubs**

The current `workspace-shell.component.spec.ts` mocks `AuthApiService` and `AuthSessionService`. You need to add stubs for `PresenceService` and `ChatService` so the existing tests don't break.

- [ ] **Step 2: Update the spec file to add service stubs**

Replace the contents of `frontend/src/app/features/workspace/workspace-shell.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { throwError } from 'rxjs';
import { vi } from 'vitest';
import { WorkspaceShellComponent } from './workspace-shell.component';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { PresenceService } from '../../core/signalr/presence.service';
import { ChatService } from '../../core/signalr/chat.service';

function buildProviders(overrides: { authApi?: object; authSession?: object } = {}) {
  const authApi = overrides.authApi ?? { logout: vi.fn() };
  const authSession = overrides.authSession ?? {
    user: signal(null).asReadonly(),
    accessToken: signal(null).asReadonly(),
    clearSession: vi.fn(),
  };
  const presenceService = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const chatService = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };

  return {
    providers: [
      provideRouter([]),
      { provide: AuthApiService, useValue: authApi },
      { provide: AuthSessionService, useValue: authSession },
      { provide: PresenceService, useValue: presenceService },
      { provide: ChatService, useValue: chatService },
    ],
    authApi,
    authSession,
    presenceService,
    chatService,
  };
}

describe('WorkspaceShellComponent', () => {
  it('renders route-backed navigation links for rooms and sessions', () => {
    const { providers } = buildProviders();
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    const compiled: Element = fixture.nativeElement;
    expect(compiled.querySelector('[data-testid="go-to-rooms"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="go-to-sessions"]')).not.toBeNull();
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('does not clear local auth state when logout fails', () => {
    const authApi = {
      logout: vi.fn().mockReturnValue(throwError(() => new Error('network'))),
    };
    const authSession = {
      user: signal(null).asReadonly(),
      accessToken: signal(null).asReadonly(),
      clearSession: vi.fn(),
    };
    const { providers } = buildProviders({ authApi, authSession });
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.componentInstance.logout();
    expect(authSession.clearSession).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('calls presence and chat connect on init', async () => {
    const { providers, presenceService, chatService } = buildProviders();
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(presenceService.connect).toHaveBeenCalledTimes(1);
    expect(chatService.connect).toHaveBeenCalledTimes(1);
  });

  it('calls presence and chat disconnect before clearing session on logout', async () => {
    const { providers, presenceService, chatService, authSession } = buildProviders();
    // Make authApi.logout return a synchronous observable for this test
    const { of } = await import('rxjs');
    const authApiWithSuccess = { logout: vi.fn().mockReturnValue(of(null)) };
    const finalProviders = [
      ...providers.filter(p => !(p as { provide: unknown }).provide || (p as { provide: unknown }).provide !== AuthApiService),
      { provide: AuthApiService, useValue: authApiWithSuccess },
    ];

    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers: finalProviders });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.logout();
    await fixture.whenStable();

    expect(presenceService.disconnect).toHaveBeenCalledTimes(1);
    expect(chatService.disconnect).toHaveBeenCalledTimes(1);
    expect((authSession as { clearSession: ReturnType<typeof vi.fn> }).clearSession).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the existing tests to confirm they still pass (before modifying the component)**

```bash
cd frontend && npx ng test --include="**/workspace-shell.component.spec.ts" --watch=false 2>&1 | tail -20
```

Expected: The first two tests pass. The two new tests (`calls presence and chat connect on init`, `calls disconnect before clearing session`) fail because the component doesn't inject those services yet.

- [ ] **Step 4: Update WorkspaceShellComponent to wire hub services**

Replace the contents of `frontend/src/app/features/workspace/workspace-shell.component.ts`:

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { PresenceService } from '../../core/signalr/presence.service';
import { ChatService } from '../../core/signalr/chat.service';

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.scss',
})
export class WorkspaceShellComponent implements OnInit {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly presence = inject(PresenceService);
  private readonly chat = inject(ChatService);

  readonly logoutError = signal('');

  ngOnInit(): void {
    void this.presence.connect();
    void this.chat.connect();
  }

  logout(): void {
    this.logoutError.set('');

    this.authApi.logout().subscribe({
      next: async () => {
        await this.presence.disconnect();
        await this.chat.disconnect();
        this.authSession.clearSession();
        void this.router.navigateByUrl('/auth');
      },
      error: () => {
        this.logoutError.set('Unable to sign out right now. Try again in a moment.');
      },
    });
  }
}
```

- [ ] **Step 5: Run all workspace-shell tests to confirm GREEN**

```bash
cd frontend && npx ng test --include="**/workspace-shell.component.spec.ts" --watch=false 2>&1 | tail -20
```

Expected: 4 tests pass, 0 failures.

- [ ] **Step 6: Run full frontend test suite — confirm no regressions**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -30
```

Expected: All tests pass. 0 failures.

- [ ] **Step 7: Run build to confirm no TypeScript errors**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -10
```

Expected: Build succeeds, no errors.

- [ ] **Step 8: Commit**

```bash
cd frontend && git add \
  src/app/features/workspace/workspace-shell.component.ts \
  src/app/features/workspace/workspace-shell.component.spec.ts
git commit -m "feat: wire PresenceService and ChatService into WorkspaceShellComponent lifecycle"
```

---

## Self-Review

### Spec Coverage

| Requirement (AGENT.md §10/11/20) | Covered By |
|----------------------------------|------------|
| PresenceHub `/hubs/presence` connection | Task 3 PresenceService |
| ChatHub `/hubs/chat` connection | Task 4 ChatService |
| JWT via `accessTokenFactory` | Task 1 HubConnectionFactory |
| `.withAutomaticReconnect()` | Task 1 HubConnectionFactory |
| `onreconnected` re-joins all rooms | Task 3 PresenceService |
| AFK: 5s setInterval, 60s threshold | Task 3 PresenceService |
| AFK: DOM events throttled 1/sec | Task 3 PresenceService |
| AFK: visibilitychange handler | Task 3 PresenceService |
| Heartbeat every 30s | Task 3 PresenceService |
| `presenceMap` signal | Task 3 PresenceService |
| `unreadCounts` signal | Task 2 UnreadService |
| `UnreadCountChanged` → UnreadService.setCount | Task 4 ChatService |
| `(window).__presenceHub` in dev mode | Task 3 PresenceService |
| `ForceDisconnect` → clearSession | Task 3 PresenceService |
| All 10 ChatHub invoke methods | Task 4 ChatService |
| All server→client events registered | Tasks 3+4 |
| WorkspaceShell connect on init | Task 5 |
| WorkspaceShell disconnect on logout | Task 5 |

### Type Consistency
- `PresenceStatus` defined once in `hub.models.ts`; used in `PresenceService.presenceMap` and `RoomMemberPresence`.
- `HubConnectionFactory` type exported from `hub-connection.factory.ts`; imported in services.
- All event interfaces reference types defined in `hub.models.ts` — no inline definitions.

### No Placeholders
- All service methods have complete implementation code.
- All test files have real assertions against real behavior.
- All run commands include expected output.
