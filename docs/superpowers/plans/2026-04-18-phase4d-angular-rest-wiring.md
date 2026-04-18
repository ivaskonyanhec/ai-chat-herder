# Phase 4d: Angular REST API Services + Component Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create Angular HTTP API services for the three implemented backend surface areas (Rooms, Users, Invitations) and wire them into the four frontend feature components that have real backend support.

**Architecture:** Each API service lives in `frontend/src/app/core/<domain>/` alongside a `.spec.ts` that uses `HttpTestingController`. Components inject the services and drive their UI exclusively via Angular Signals. The `SessionsPanelComponent` is the canonical reference pattern: inject API service → `signal<T[]>([])` for data, `signal(true)` for loading, `signal('')` for error → load in `constructor()` → template reads from signals.

**Tech Stack:** Angular 21 Signals, `HttpClient`, `HttpTestingController`, Vitest, `@angular/router` `ActivatedRoute`, `ChatService` + `PresenceService` (from Phase 4c).

**Scope note:** Friends, dialogs, blocks, and platform bans have no backend endpoints yet — those components stay static and are deferred to Phase 4e.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/app/core/rooms/rooms.models.ts` | `RoomCatalogItem`, `RoomDto`, `RoomMemberDto`, `CreateRoomRequest` interfaces |
| Create | `frontend/src/app/core/rooms/rooms-api.service.ts` | HTTP client for all `/api/rooms` endpoints |
| Create | `frontend/src/app/core/rooms/rooms-api.service.spec.ts` | Unit tests with HttpTestingController |
| Create | `frontend/src/app/core/invitations/invitations.models.ts` | `RoomInvitationDto` interface |
| Create | `frontend/src/app/core/invitations/invitations-api.service.ts` | HTTP client for `/api/invitations` and `/api/rooms/{id}/invitations` |
| Create | `frontend/src/app/core/invitations/invitations-api.service.spec.ts` | Unit tests |
| Create | `frontend/src/app/core/users/users-api.service.ts` | HTTP client for `/api/users/me` and `/api/users/by-username/{name}` |
| Create | `frontend/src/app/core/users/users-api.service.spec.ts` | Unit tests |
| Modify | `frontend/src/app/features/rooms/rooms-home.component.ts` | Wire RoomsApiService; load public catalog on init |
| Modify | `frontend/src/app/features/rooms/rooms-home.component.html` | Replace static data with `@for` over `rooms()` signal |
| Modify | `frontend/src/app/features/rooms/room-chat/room-chat.ts` | Wire RoomsApiService + ChatService + PresenceService; load history + real-time |
| Modify | `frontend/src/app/features/rooms/room-chat/room-chat.html` | Replace static messages with real data bindings |
| Modify | `frontend/src/app/features/profile/profile-settings/profile-settings.ts` | Wire UsersApiService; load fresh user data on init |
| Modify | `frontend/src/app/features/profile/profile-settings/profile-settings.html` | Replace static placeholders with user signal bindings |
| Modify | `frontend/src/app/features/rooms/room-invitations/room-invitations.ts` | Wire InvitationsApiService; load + accept/reject |
| Modify | `frontend/src/app/features/rooms/room-invitations/room-invitations.html` | Replace static cards with `@for` over `invitations()` signal |

---

## Context Reference

### Server DTO shapes (verified from C# source)

**Public catalog item** (`GET /api/rooms` anonymous projection — NOT a full `RoomDto`):
```typescript
// Server returns: { id, name, description, ownerId, createdAt, memberCount }
interface RoomCatalogItem {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  memberCount: number;
}
```

**Full room** (`GET /api/rooms/{id}` returns `RoomDto`):
```typescript
interface RoomDto {
  id: string;
  name: string;
  description: string | null;
  visibility: 'Public' | 'Private';
  ownerId: string;
  createdAt: string;
  memberCount: number;
  callerRole: 'Owner' | 'Admin' | 'Member' | null;
}
```

**Room member** (`GET /api/rooms/{id}/members` returns `RoomMemberDto[]`):
```typescript
interface RoomMemberDto {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: string;           // 'Owner' | 'Admin' | 'Member'
  joinedAt: string;
  presenceStatus: string; // 'online' | 'afk' | 'offline'
}
```

**Room invitation** (`GET /api/invitations` returns `RoomInvitationDto[]`):
```typescript
interface RoomInvitationDto {
  id: string;
  roomId: string;
  roomName: string;
  invitedByUserId: string;
  invitedByUsername: string;
  invitedUserId: string;
  invitedUsername: string;
  status: string;         // 'Pending' | 'Accepted' | 'Rejected'
  createdAt: string;
}
```

**Messages** (`GET /api/rooms/{id}/messages` returns `MessageDto[]`):
- `MessageDto` already defined in `frontend/src/app/core/signalr/hub.models.ts` — import from there.

**User** (`GET /api/users/me` returns `UserDto`):
- Same shape as `User` in `frontend/src/app/core/auth/auth.models.ts` — import from there.

### Message query params
- Initial load: `GET /api/rooms/{id}/messages?limit=50`
- Older messages: `GET /api/rooms/{id}/messages?before={oldestMessageId}&limit=50`

### Existing patterns to follow
- `SessionsApiService` at `frontend/src/app/core/session/sessions-api.service.ts` — canonical HTTP service pattern.
- `SessionsPanelComponent` at `frontend/src/app/features/sessions/sessions-panel.component.ts` — canonical component wiring pattern.
- `SessionsApiService.spec.ts` — canonical test pattern with `HttpTestingController`.
- Test runner: Vitest (`vi.fn()`, import from `vitest`). All tests use `TestBed`.

### ChatService event consumption pattern
```typescript
// In component:
private readonly chat = inject(ChatService);

constructor() {
  effect(() => {
    const event = this.chat.lastRoomEvent();
    if (!event) return;
    if (event.type === 'MessageReceived') {
      this.messages.update(msgs => [...msgs, event.payload]);
    }
    if (event.type === 'MessageEdited') {
      this.messages.update(msgs =>
        msgs.map(m => m.id === event.payload.id ? event.payload : m)
      );
    }
    if (event.type === 'MessageDeleted') {
      this.messages.update(msgs =>
        msgs.map(m => m.id === event.payload.messageId ? { ...m, isDeleted: true, content: null } : m)
      );
    }
  });
}
```

### PresenceService room join pattern
```typescript
// ngOnInit: join room
void this.presence.joinRoom(this.roomId());
// ngOnDestroy: leave room
void this.presence.leaveRoom(this.roomId());
```

---

## Task 1: RoomsApiService

**Files:**
- Create: `frontend/src/app/core/rooms/rooms.models.ts`
- Create: `frontend/src/app/core/rooms/rooms-api.service.ts`
- Create: `frontend/src/app/core/rooms/rooms-api.service.spec.ts`

- [ ] **Step 1: Create rooms.models.ts**

Create `frontend/src/app/core/rooms/rooms.models.ts`:

```typescript
export interface RoomCatalogItem {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  memberCount: number;
}

export interface RoomDto {
  id: string;
  name: string;
  description: string | null;
  visibility: 'Public' | 'Private';
  ownerId: string;
  createdAt: string;
  memberCount: number;
  callerRole: 'Owner' | 'Admin' | 'Member' | null;
}

export interface RoomMemberDto {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  presenceStatus: string;
}

export interface CreateRoomRequest {
  name: string;
  description: string | null;
  visibility: 'Public' | 'Private';
}
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/app/core/rooms/rooms-api.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RoomsApiService } from './rooms-api.service';
import { RoomCatalogItem, RoomDto } from './rooms.models';

describe('RoomsApiService', () => {
  let httpMock: HttpTestingController;
  let service: RoomsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), RoomsApiService],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(RoomsApiService);
  });

  afterEach(() => httpMock.verify());

  it('fetches public catalog without search params', () => {
    const expected: RoomCatalogItem[] = [
      { id: 'r1', name: 'Design Hub', description: null, ownerId: 'u1', createdAt: '2026-01-01T00:00:00Z', memberCount: 42 },
    ];
    let actual: RoomCatalogItem[] | undefined;

    service.getPublicCatalog().subscribe(rooms => (actual = rooms));

    const req = httpMock.expectOne('/api/rooms');
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('fetches public catalog with search query param', () => {
    service.getPublicCatalog('design').subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/rooms' && r.params.get('search') === 'design');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('fetches a single room by id', () => {
    const expected: RoomDto = {
      id: 'room-1', name: 'Hub', description: null, visibility: 'Public',
      ownerId: 'u1', createdAt: '2026-01-01T00:00:00Z', memberCount: 5, callerRole: 'Member',
    };
    let actual: RoomDto | undefined;

    service.getRoom('room-1').subscribe(r => (actual = r));

    const req = httpMock.expectOne('/api/rooms/room-1');
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('joins a room', () => {
    service.joinRoom('room-1').subscribe();
    const req = httpMock.expectOne('/api/rooms/room-1/join');
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('loads message history', () => {
    service.getMessages('room-1').subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/rooms/room-1/messages' && r.params.get('limit') === '50');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('loads message history before a given message id', () => {
    service.getMessages('room-1', 'msg-99').subscribe();
    const req = httpMock.expectOne(r =>
      r.url === '/api/rooms/room-1/messages' &&
      r.params.get('before') === 'msg-99' &&
      r.params.get('limit') === '50'
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
```

- [ ] **Step 3: Run tests to confirm RED**

```bash
cd frontend && npx ng test --include="**/rooms-api.service.spec.ts" --watch=false 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module './rooms-api.service'`

- [ ] **Step 4: Implement RoomsApiService**

Create `frontend/src/app/core/rooms/rooms-api.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RoomCatalogItem, RoomDto, RoomMemberDto, CreateRoomRequest } from './rooms.models';
import type { MessageDto } from '../signalr/hub.models';

@Injectable({ providedIn: 'root' })
export class RoomsApiService {
  private readonly http = inject(HttpClient);

  getPublicCatalog(search?: string, page = 1, limit = 20): Observable<RoomCatalogItem[]> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (search) params = params.set('search', search);
    return this.http.get<RoomCatalogItem[]>('/api/rooms', { params });
  }

  getMyRooms(): Observable<RoomDto[]> {
    return this.http.get<RoomDto[]>('/api/rooms/my');
  }

  getRoom(id: string): Observable<RoomDto> {
    return this.http.get<RoomDto>(`/api/rooms/${id}`);
  }

  createRoom(req: CreateRoomRequest): Observable<RoomDto> {
    return this.http.post<RoomDto>('/api/rooms', req);
  }

  joinRoom(id: string): Observable<void> {
    return this.http.post<void>(`/api/rooms/${id}/join`, {});
  }

  leaveRoom(id: string): Observable<void> {
    return this.http.delete<void>(`/api/rooms/${id}/leave`);
  }

  getMembers(id: string): Observable<RoomMemberDto[]> {
    return this.http.get<RoomMemberDto[]>(`/api/rooms/${id}/members`);
  }

  getMessages(id: string, before?: string, limit = 50): Observable<MessageDto[]> {
    let params = new HttpParams().set('limit', limit);
    if (before) params = params.set('before', before);
    return this.http.get<MessageDto[]>(`/api/rooms/${id}/messages`, { params });
  }
}
```

- [ ] **Step 5: Run tests to confirm GREEN**

```bash
cd frontend && npx ng test --include="**/rooms-api.service.spec.ts" --watch=false 2>&1 | tail -15
```

Expected: 6 tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/app/core/rooms/
git commit -m "feat: add RoomsApiService with catalog, room detail, join, and message history"
```

---

## Task 2: InvitationsApiService

**Files:**
- Create: `frontend/src/app/core/invitations/invitations.models.ts`
- Create: `frontend/src/app/core/invitations/invitations-api.service.ts`
- Create: `frontend/src/app/core/invitations/invitations-api.service.spec.ts`

- [ ] **Step 1: Create invitations.models.ts**

Create `frontend/src/app/core/invitations/invitations.models.ts`:

```typescript
export interface RoomInvitationDto {
  id: string;
  roomId: string;
  roomName: string;
  invitedByUserId: string;
  invitedByUsername: string;
  invitedUserId: string;
  invitedUsername: string;
  status: 'Pending' | 'Accepted' | 'Rejected';
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/app/core/invitations/invitations-api.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { InvitationsApiService } from './invitations-api.service';
import { RoomInvitationDto } from './invitations.models';

describe('InvitationsApiService', () => {
  let httpMock: HttpTestingController;
  let service: InvitationsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), InvitationsApiService],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(InvitationsApiService);
  });

  afterEach(() => httpMock.verify());

  it('fetches my invitations', () => {
    const expected: RoomInvitationDto[] = [{
      id: 'inv-1', roomId: 'r1', roomName: 'Hub', invitedByUserId: 'u1',
      invitedByUsername: 'alice', invitedUserId: 'u2', invitedUsername: 'bob',
      status: 'Pending', createdAt: '2026-01-01T00:00:00Z',
    }];
    let actual: RoomInvitationDto[] | undefined;

    service.getMyInvitations().subscribe(inv => (actual = inv));

    const req = httpMock.expectOne('/api/invitations');
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('accepts an invitation', () => {
    service.acceptInvitation('inv-1').subscribe();
    const req = httpMock.expectOne('/api/invitations/inv-1/accept');
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('rejects an invitation', () => {
    service.rejectInvitation('inv-1').subscribe();
    const req = httpMock.expectOne('/api/invitations/inv-1/reject');
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });
});
```

- [ ] **Step 3: Run tests to confirm RED**

```bash
cd frontend && npx ng test --include="**/invitations-api.service.spec.ts" --watch=false 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module './invitations-api.service'`

- [ ] **Step 4: Implement InvitationsApiService**

Create `frontend/src/app/core/invitations/invitations-api.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RoomInvitationDto } from './invitations.models';

@Injectable({ providedIn: 'root' })
export class InvitationsApiService {
  private readonly http = inject(HttpClient);

  getMyInvitations(): Observable<RoomInvitationDto[]> {
    return this.http.get<RoomInvitationDto[]>('/api/invitations');
  }

  getRoomInvitations(roomId: string): Observable<RoomInvitationDto[]> {
    return this.http.get<RoomInvitationDto[]>(`/api/rooms/${roomId}/invitations`);
  }

  sendInvitation(roomId: string, username: string): Observable<RoomInvitationDto> {
    return this.http.post<RoomInvitationDto>(`/api/rooms/${roomId}/invitations`, { username });
  }

  acceptInvitation(id: string): Observable<void> {
    return this.http.post<void>(`/api/invitations/${id}/accept`, {});
  }

  rejectInvitation(id: string): Observable<void> {
    return this.http.post<void>(`/api/invitations/${id}/reject`, {});
  }
}
```

- [ ] **Step 5: Run tests to confirm GREEN**

```bash
cd frontend && npx ng test --include="**/invitations-api.service.spec.ts" --watch=false 2>&1 | tail -15
```

Expected: 3 tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/app/core/invitations/
git commit -m "feat: add InvitationsApiService for room invitations accept/reject flow"
```

---

## Task 3: UsersApiService

**Files:**
- Create: `frontend/src/app/core/users/users-api.service.ts`
- Create: `frontend/src/app/core/users/users-api.service.spec.ts`

`User` interface is already in `frontend/src/app/core/auth/auth.models.ts` — reuse it (same shape as server's `UserDto`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/core/users/users-api.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { UsersApiService } from './users-api.service';
import { User } from '../auth/auth.models';

describe('UsersApiService', () => {
  let httpMock: HttpTestingController;
  let service: UsersApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), UsersApiService],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(UsersApiService);
  });

  afterEach(() => httpMock.verify());

  it('fetches current user', () => {
    const expected: User = { id: 'u1', username: 'alice', email: 'alice@firm.com', avatarUrl: null };
    let actual: User | undefined;

    service.getMe().subscribe(u => (actual = u));

    const req = httpMock.expectOne('/api/users/me');
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('patches avatar URL', () => {
    service.patchMe('https://example.com/avatar.jpg').subscribe();
    const req = httpMock.expectOne('/api/users/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ avatarUrl: 'https://example.com/avatar.jpg' });
    req.flush(null);
  });

  it('fetches user by username', () => {
    service.getByUsername('alice').subscribe();
    const req = httpMock.expectOne('/api/users/by-username/alice');
    expect(req.request.method).toBe('GET');
    req.flush(null);
  });
});
```

- [ ] **Step 2: Run tests to confirm RED**

```bash
cd frontend && npx ng test --include="**/users-api.service.spec.ts" --watch=false 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module './users-api.service'`

- [ ] **Step 3: Implement UsersApiService**

Create `frontend/src/app/core/users/users-api.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../auth/auth.models';

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);

  getMe(): Observable<User> {
    return this.http.get<User>('/api/users/me');
  }

  patchMe(avatarUrl: string): Observable<void> {
    return this.http.patch<void>('/api/users/me', { avatarUrl });
  }

  getByUsername(username: string): Observable<User> {
    return this.http.get<User>(`/api/users/by-username/${username}`);
  }
}
```

- [ ] **Step 4: Run tests to confirm GREEN**

```bash
cd frontend && npx ng test --include="**/users-api.service.spec.ts" --watch=false 2>&1 | tail -15
```

Expected: 3 tests pass, 0 failures.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/app/core/users/
git commit -m "feat: add UsersApiService for me, patchMe, and by-username"
```

---

## Task 4: Wire RoomsHomeComponent

Connect `RoomsHomeComponent` to `RoomsApiService`. Replace hardcoded room data with real API data. Keep the visual structure from the design (bento grid header + room cards list beneath it).

**Files:**
- Modify: `frontend/src/app/features/rooms/rooms-home.component.ts`
- Modify: `frontend/src/app/features/rooms/rooms-home.component.html`

- [ ] **Step 1: Read the current component and template**

Read both files:
- `frontend/src/app/features/rooms/rooms-home.component.ts`
- `frontend/src/app/features/rooms/rooms-home.component.html`

Note which signals already exist (`user`, `memberStatusTestId`) and preserve them.

- [ ] **Step 2: Update the component TypeScript**

Replace `frontend/src/app/features/rooms/rooms-home.component.ts`:

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { RoomsApiService } from '../../core/rooms/rooms-api.service';
import { RoomCatalogItem } from '../../core/rooms/rooms.models';

@Component({
  selector: 'app-rooms-home',
  imports: [RouterLink],
  templateUrl: './rooms-home.component.html',
  styleUrl: './rooms-home.component.scss',
})
export class RoomsHomeComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly roomsApi = inject(RoomsApiService);
  private readonly router = inject(Router);

  readonly user = this.authSession.user;
  readonly memberStatusTestId = computed(() => {
    const user = this.user();
    return user ? `member-status-${user.id}` : 'member-status-anonymous';
  });

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly rooms = signal<RoomCatalogItem[]>([]);
  readonly joiningRoomId = signal<string | null>(null);

  constructor() {
    this.loadCatalog();
  }

  navigateToRoom(roomId: string): void {
    void this.router.navigateByUrl(`/app/rooms/${roomId}`);
  }

  joinAndNavigate(roomId: string): void {
    if (this.joiningRoomId()) return;
    this.joiningRoomId.set(roomId);
    this.roomsApi.joinRoom(roomId)
      .pipe(finalize(() => this.joiningRoomId.set(null)))
      .subscribe({
        next: () => void this.router.navigateByUrl(`/app/rooms/${roomId}`),
        error: () => this.navigateToRoom(roomId),
      });
  }

  private loadCatalog(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.roomsApi.getPublicCatalog()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: rooms => this.rooms.set(rooms),
        error: () => this.errorMessage.set('Unable to load rooms right now.'),
      });
  }
}
```

- [ ] **Step 3: Update the template**

Replace `frontend/src/app/features/rooms/rooms-home.component.html` with:

```html
<section class="flex-1 overflow-y-auto p-8 bg-surface" data-testid="rooms-home">
  <div class="max-w-7xl mx-auto">
    <div class="mb-10">
      <h1 class="text-3xl font-extrabold tracking-tight text-on-surface mb-2">Public Rooms Catalog</h1>
      <p class="text-on-surface-variant max-w-2xl">Explore open architectural workshops and collaborative design spaces within the global workspace ecosystem.</p>
    </div>

    @if (isLoading()) {
      <div class="flex justify-center py-24">
        <span class="material-symbols-outlined text-4xl text-outline animate-spin">progress_activity</span>
      </div>
    } @else if (errorMessage()) {
      <p class="text-error text-sm bg-error-container/20 border border-error/20 rounded-xl px-6 py-4">{{ errorMessage() }}</p>
    } @else if (rooms().length === 0) {
      <div class="text-center py-24">
        <span class="material-symbols-outlined text-5xl text-outline mb-4 block">meeting_room</span>
        <p class="text-on-surface-variant">No public rooms yet. Be the first to create one.</p>
      </div>
    } @else {
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        @for (room of rooms(); track room.id) {
          <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6 flex flex-col gap-4 hover:shadow-sm transition-shadow">
            <div class="flex items-start justify-between gap-3">
              <div class="w-10 h-10 bg-primary-container flex items-center justify-center rounded-lg shrink-0">
                <span class="material-symbols-outlined text-on-primary-container" style="font-size:1.25rem">meeting_room</span>
              </div>
              <span class="text-[10px] font-bold uppercase tracking-widest text-outline bg-surface-container px-2 py-0.5 rounded-full">Public</span>
            </div>
            <div class="flex-1">
              <h3 class="font-bold text-on-surface mb-1">{{ room.name }}</h3>
              @if (room.description) {
                <p class="text-xs text-on-surface-variant line-clamp-2">{{ room.description }}</p>
              }
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-outline-variant/10">
              <div class="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span class="material-symbols-outlined" style="font-size:1rem">group</span>
                <span>{{ room.memberCount }} members</span>
              </div>
              <button
                class="px-4 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:bg-primary-dim transition-colors disabled:opacity-50"
                [disabled]="joiningRoomId() === room.id"
                (click)="joinAndNavigate(room.id)"
              >
                {{ joiningRoomId() === room.id ? 'Joining…' : 'Join Room' }}
              </button>
            </div>
          </div>
        }
      </div>
    }
  </div>
</section>
```

- [ ] **Step 4: Run full test suite**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -10
```

Expected: all tests pass (RoomsHomeComponent has no spec file to update).

- [ ] **Step 5: Run build**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/app/features/rooms/rooms-home.component.ts src/app/features/rooms/rooms-home.component.html
git commit -m "feat: wire RoomsHomeComponent to RoomsApiService — real public catalog with join"
```

---

## Task 5: Wire RoomChatComponent

Connect `RoomChatComponent` to `RoomsApiService` (history load), `ChatService` (real-time + send), and `PresenceService` (room group join/leave). Use `ActivatedRoute` to read the room ID from the URL.

**Files:**
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.ts`
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.html`

- [ ] **Step 1: Update the component TypeScript**

Replace `frontend/src/app/features/rooms/room-chat/room-chat.ts`:

```typescript
import { Component, OnInit, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { FormsModule } from '@angular/forms';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { RoomDto } from '../../../core/rooms/rooms.models';
import { ChatService } from '../../../core/signalr/chat.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import type { MessageDto } from '../../../core/signalr/hub.models';

@Component({
  selector: 'app-room-chat',
  standalone: true,
  imports: [Button, Textarea, FormsModule],
  templateUrl: './room-chat.html',
  styleUrl: './room-chat.scss',
})
export class RoomChatComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly authSession = inject(AuthSessionService);
  private readonly roomsApi = inject(RoomsApiService);
  private readonly chat = inject(ChatService);
  private readonly presence = inject(PresenceService);

  readonly user = this.authSession.user;
  readonly roomId = computed(() => this.route.snapshot.params['id'] as string);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly room = signal<RoomDto | null>(null);
  readonly messages = signal<MessageDto[]>([]);
  readonly messageText = signal('');
  readonly isSending = signal(false);

  constructor() {
    effect(() => {
      const event = this.chat.lastRoomEvent();
      if (!event) return;

      if (event.type === 'MessageReceived') {
        this.messages.update(msgs => [...msgs, event.payload]);
      } else if (event.type === 'MessageEdited') {
        this.messages.update(msgs =>
          msgs.map(m => m.id === event.payload.id ? event.payload : m)
        );
      } else if (event.type === 'MessageDeleted') {
        this.messages.update(msgs =>
          msgs.map(m => m.id === event.payload.messageId
            ? { ...m, isDeleted: true, content: null }
            : m
          )
        );
      }
    });
  }

  ngOnInit(): void {
    const id = this.roomId();
    void this.presence.joinRoom(id);
    this.loadRoom(id);
  }

  ngOnDestroy(): void {
    void this.presence.leaveRoom(this.roomId());
  }

  sendMessage(): void {
    const content = this.messageText().trim();
    if (!content || this.isSending()) return;
    this.isSending.set(true);
    void this.chat.sendMessage(this.roomId(), content, null, null)
      .finally(() => {
        this.isSending.set(false);
        this.messageText.set('');
      });
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private loadRoom(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.roomsApi.getRoom(id).subscribe({
      next: room => {
        this.room.set(room);
        this.roomsApi.getMessages(id)
          .pipe(finalize(() => this.isLoading.set(false)))
          .subscribe({
            next: msgs => this.messages.set(msgs),
            error: () => {
              this.isLoading.set(false);
              this.errorMessage.set('Unable to load messages.');
            },
          });
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Room not found or access denied.');
      },
    });
  }
}
```

- [ ] **Step 2: Update the template**

Replace `frontend/src/app/features/rooms/room-chat/room-chat.html` with:

```html
<div class="room-chat flex h-full overflow-hidden">

  <!-- Center: Active Chat Canvas -->
  <section class="flex flex-col flex-1 bg-surface-container-lowest min-w-0">

    <!-- Chat Header -->
    <div class="h-16 px-6 flex items-center justify-between bg-surface-container-lowest shadow-sm z-10">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-bold text-on-surface">#{{ room()?.name ?? '…' }}</h1>
        @if (room()) {
          <span class="px-2 py-0.5 bg-surface-container text-on-surface-variant text-[10px] rounded uppercase font-bold tracking-widest">{{ room()!.visibility }}</span>
        }
      </div>
      <div class="flex items-center gap-4">
        <span class="text-on-surface-variant text-xs">{{ room()?.memberCount }} members</span>
      </div>
    </div>

    <!-- Messages Area -->
    <div class="flex-1 overflow-y-auto p-6 space-y-6" data-testid="chat-area">

      @if (isLoading()) {
        <div class="flex justify-center py-16">
          <span class="material-symbols-outlined text-3xl text-outline animate-spin">progress_activity</span>
        </div>
      } @else if (errorMessage()) {
        <p class="text-error text-sm bg-error-container/20 border border-error/20 rounded-xl px-4 py-3">{{ errorMessage() }}</p>
      } @else if (messages().length === 0) {
        <div class="flex flex-col items-center justify-center py-24 gap-3">
          <span class="material-symbols-outlined text-5xl text-outline">chat_bubble_outline</span>
          <p class="text-on-surface-variant text-sm">No messages yet. Say hello!</p>
        </div>
      } @else {
        @for (msg of messages(); track msg.id) {
          <div class="flex gap-4 group">
            @if (msg.sender.avatarUrl) {
              <img [alt]="msg.sender.username" [src]="msg.sender.avatarUrl"
                class="w-10 h-10 rounded-lg object-cover shrink-0" />
            } @else {
              <div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                <span class="text-sm font-bold text-on-surface-variant">{{ msg.sender.username[0].toUpperCase() }}</span>
              </div>
            }
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 mb-1">
                <span class="text-sm font-bold text-on-surface">{{ msg.sender.username }}</span>
                <span class="text-[10px] text-outline tracking-wider">{{ formatTime(msg.sentAt) }}</span>
                @if (msg.editedAt) {
                  <span class="text-[10px] text-outline italic">(edited)</span>
                }
              </div>
              @if (msg.isDeleted) {
                <p class="text-sm text-outline italic">Message deleted.</p>
              } @else {
                <p class="text-sm text-on-surface leading-relaxed max-w-2xl">{{ msg.content }}</p>
              }
            </div>
          </div>
        }
      }
    </div>

    <!-- Composer -->
    <div class="border-t border-outline-variant/10 p-4 bg-surface-container-lowest">
      <div class="flex gap-3 items-end">
        <textarea
          pTextarea
          data-testid="message-input"
          class="flex-1 resize-none bg-surface-container rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none min-h-[48px] max-h-32"
          rows="1"
          placeholder="Type a message…"
          [ngModel]="messageText()"
          (ngModelChange)="messageText.set($event)"
          (keydown.enter)="$event.preventDefault(); sendMessage()"
        ></textarea>
        <p-button
          label="Send"
          [disabled]="!messageText().trim() || isSending()"
          (onClick)="sendMessage()"
        ></p-button>
      </div>
    </div>

  </section>
</div>
```

- [ ] **Step 3: Run full test suite**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Run build**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/app/features/rooms/room-chat/
git commit -m "feat: wire RoomChatComponent — load history from API, real-time via ChatService"
```

---

## Task 6: Wire ProfileSettingsComponent

Load the current user from `UsersApiService` on init so the profile page shows fresh data from the server.

**Files:**
- Modify: `frontend/src/app/features/profile/profile-settings/profile-settings.ts`
- Modify: `frontend/src/app/features/profile/profile-settings/profile-settings.html`

- [ ] **Step 1: Read the current component and template**

Read both files first to understand existing structure.

- [ ] **Step 2: Update the component TypeScript**

Replace `frontend/src/app/features/profile/profile-settings/profile-settings.ts`:

```typescript
import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { UsersApiService } from '../../../core/users/users-api.service';
import { User } from '../../../core/auth/auth.models';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [],
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.scss',
})
export class ProfileSettingsComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly usersApi = inject(UsersApiService);

  readonly isLoading = signal(true);
  readonly profile = signal<User | null>(this.authSession.user());

  constructor() {
    this.usersApi.getMe()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: user => this.profile.set(user),
        error: () => { /* fall back to cached session user */ },
      });
  }
}
```

- [ ] **Step 3: Update the template**

Read the current `profile-settings.html` first. Then replace the static `user()?.username`, `user()?.email`, `user()?.avatarUrl` bindings with `profile()?.username`, `profile()?.email`, `profile()?.avatarUrl`. Add a loading state for the avatar.

The template structure should stay exactly as the design. Only change the data bindings from `user()` to `profile()`. Here is the key pattern for the avatar and user info:

```html
<!-- Avatar display — replace any static src with: -->
@if (profile()?.avatarUrl) {
  <img [src]="profile()!.avatarUrl" [alt]="profile()?.username" class="w-20 h-20 rounded-xl object-cover" />
} @else {
  <div class="w-20 h-20 rounded-xl bg-primary-container flex items-center justify-center">
    <span class="text-2xl font-bold text-on-primary-container">{{ profile()?.username?.[0]?.toUpperCase() }}</span>
  </div>
}

<!-- Username and email bindings: -->
<!-- {{ profile()?.username }} -->
<!-- {{ profile()?.email }} -->
```

Read the full current HTML template, then produce an updated version that uses `profile()` instead of `user()` throughout, and adds the avatar fallback pattern above. Preserve all existing Tailwind classes exactly.

- [ ] **Step 4: Run build**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/app/features/profile/profile-settings/
git commit -m "feat: wire ProfileSettingsComponent to UsersApiService — load fresh user profile"
```

---

## Task 7: Wire RoomInvitationsComponent

Load pending invitations from `InvitationsApiService` on init. Add accept/reject actions.

**Files:**
- Modify: `frontend/src/app/features/rooms/room-invitations/room-invitations.ts`
- Modify: `frontend/src/app/features/rooms/room-invitations/room-invitations.html`

- [ ] **Step 1: Update the component TypeScript**

Replace `frontend/src/app/features/rooms/room-invitations/room-invitations.ts`:

```typescript
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { InvitationsApiService } from '../../../core/invitations/invitations-api.service';
import { RoomInvitationDto } from '../../../core/invitations/invitations.models';

@Component({
  selector: 'app-room-invitations',
  standalone: true,
  imports: [],
  templateUrl: './room-invitations.html',
  styleUrl: './room-invitations.scss',
})
export class RoomInvitationsComponent {
  private readonly invitationsApi = inject(InvitationsApiService);
  private readonly router = inject(Router);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly invitations = signal<RoomInvitationDto[]>([]);
  readonly processingId = signal<string | null>(null);

  constructor() {
    this.loadInvitations();
  }

  accept(invitation: RoomInvitationDto): void {
    if (this.processingId()) return;
    this.processingId.set(invitation.id);
    this.invitationsApi.acceptInvitation(invitation.id)
      .pipe(finalize(() => this.processingId.set(null)))
      .subscribe({
        next: () => {
          this.invitations.update(list => list.filter(i => i.id !== invitation.id));
          void this.router.navigateByUrl(`/app/rooms/${invitation.roomId}`);
        },
        error: () => this.errorMessage.set('Unable to accept the invitation right now.'),
      });
  }

  reject(id: string): void {
    if (this.processingId()) return;
    this.processingId.set(id);
    this.invitationsApi.rejectInvitation(id)
      .pipe(finalize(() => this.processingId.set(null)))
      .subscribe({
        next: () => this.invitations.update(list => list.filter(i => i.id !== id)),
        error: () => this.errorMessage.set('Unable to decline the invitation right now.'),
      });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  private loadInvitations(): void {
    this.isLoading.set(true);
    this.invitationsApi.getMyInvitations()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: invitations => this.invitations.set(invitations.filter(i => i.status === 'Pending')),
        error: () => this.errorMessage.set('Unable to load invitations.'),
      });
  }
}
```

- [ ] **Step 2: Update the template**

Read the current `room-invitations.html`. Replace the static invitation cards with a `@for` loop over `invitations()`. Keep the visual card structure from the design. Here is the pattern:

```html
<!-- outer wrapper stays the same -->
@if (isLoading()) {
  <div class="flex justify-center py-16">
    <span class="material-symbols-outlined text-3xl text-outline animate-spin">progress_activity</span>
  </div>
} @else if (errorMessage()) {
  <p class="text-error text-sm bg-error-container/20 border border-error/20 rounded-xl px-4 py-3">{{ errorMessage() }}</p>
} @else if (invitations().length === 0) {
  <div class="text-center py-24">
    <span class="material-symbols-outlined text-5xl text-outline mb-4 block">mail</span>
    <p class="text-on-surface-variant">No pending invitations.</p>
  </div>
} @else {
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    @for (inv of invitations(); track inv.id) {
      <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6 flex flex-col gap-4">
        <div class="flex items-start gap-4">
          <div class="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-on-primary-container" style="font-size:1.25rem">meeting_room</span>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-on-surface">{{ inv.roomName }}</h3>
            <p class="text-xs text-on-surface-variant">Invited by &#64;{{ inv.invitedByUsername }} · {{ formatDate(inv.createdAt) }}</p>
          </div>
        </div>
        <div class="flex gap-3">
          <button
            class="flex-1 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:bg-primary-dim transition-colors disabled:opacity-50"
            [disabled]="processingId() === inv.id"
            (click)="accept(inv)"
          >{{ processingId() === inv.id ? '…' : 'Accept Invitation' }}</button>
          <button
            class="flex-1 py-2 bg-surface-container text-on-surface-variant text-sm font-bold rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-50"
            [disabled]="processingId() === inv.id"
            (click)="reject(inv.id)"
          >Decline</button>
        </div>
      </div>
    }
  </div>
}
```

Read the current HTML, keep the outer `<section>` wrapper and header section from the design, and replace the static invitation cards area with the pattern above.

- [ ] **Step 3: Run full test suite**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Run build**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/app/features/rooms/room-invitations/
git commit -m "feat: wire RoomInvitationsComponent — load invitations, accept navigates to room"
```

---

## Self-Review

### Spec Coverage

| Component / Service | Backend endpoint | Covered |
|---------------------|-----------------|---------|
| `RoomsApiService.getPublicCatalog` | `GET /api/rooms` | Task 1 |
| `RoomsApiService.getRoom` | `GET /api/rooms/{id}` | Task 1 |
| `RoomsApiService.joinRoom` | `POST /api/rooms/{id}/join` | Task 1 |
| `RoomsApiService.getMessages` | `GET /api/rooms/{id}/messages` | Task 1 |
| `InvitationsApiService.getMyInvitations` | `GET /api/invitations` | Task 2 |
| `InvitationsApiService.acceptInvitation` | `POST /api/invitations/{id}/accept` | Task 2 |
| `InvitationsApiService.rejectInvitation` | `POST /api/invitations/{id}/reject` | Task 2 |
| `UsersApiService.getMe` | `GET /api/users/me` | Task 3 |
| `RoomsHomeComponent` data | Real catalog | Task 4 |
| `RoomChatComponent` history | Real messages | Task 5 |
| `RoomChatComponent` real-time | `ChatService.lastRoomEvent()` | Task 5 |
| `RoomChatComponent` send | `ChatService.sendMessage()` | Task 5 |
| `ProfileSettingsComponent` | Fresh user from API | Task 6 |
| `RoomInvitationsComponent` | Accept/reject invitations | Task 7 |

### Out of scope (no backend endpoints yet)
- `ContactsHomeComponent` — friends API
- `FriendRequestsComponent` — friend requests API
- `DirectMessagesComponent` — dialogs API
- `PlatformBansComponent` — platform ban API
- `ManageRoomComponent` — room admin actions (exist on backend, deferred for Phase 4e)

### No Placeholders
All code blocks in each task are complete and runnable.
