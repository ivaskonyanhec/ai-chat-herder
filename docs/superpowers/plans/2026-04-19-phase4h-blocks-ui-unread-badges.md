# Phase 4h — Blocks UI + Unread Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Blocks UI (BlocksApiService + BlockedUsersComponent screen) and unread badge display (NotificationsApiService bootstrap + dynamic sidebar room list with per-room unread counts).

**Architecture:** A new `BlocksApiService` under `core/blocks/` follows the same pattern as `FriendsApiService`. A `BlockedUsersComponent` at route `/app/blocks` lists blocked users with an Unblock action. A `NotificationsApiService` fetches `GET /unread` on workspace init to seed `UnreadService`; the sidebar is made dynamic so per-room unread badge counts from `UnreadService` render inline. Room-chat and DM components call `POST .../read` on enter to clear badges.

**Tech Stack:** Angular 21 Signals + Standalone Components, `HttpClient` + `HttpTestingController`, `UnreadService` (already exists), `RoomsApiService.getMyRooms()` (already exists), Tailwind CSS utility classes, PrimeNG only where existing shell already uses it.

---

## File Map

| Action | File |
|--------|------|
| Create | `frontend/src/app/core/blocks/blocks.models.ts` |
| Create | `frontend/src/app/core/blocks/blocks-api.service.ts` |
| Create | `frontend/src/app/core/blocks/blocks-api.service.spec.ts` |
| Create | `frontend/src/app/features/contacts/blocked-users/blocked-users.ts` |
| Create | `frontend/src/app/features/contacts/blocked-users/blocked-users.html` |
| Create | `frontend/src/app/features/contacts/blocked-users/blocked-users.spec.ts` |
| Create | `frontend/src/app/core/notifications/notifications-api.service.ts` |
| Create | `frontend/src/app/core/notifications/notifications-api.service.spec.ts` |
| Modify | `frontend/src/app/app.routes.ts` |
| Modify | `frontend/src/app/features/workspace/workspace-shell.component.ts` |
| Modify | `frontend/src/app/features/workspace/workspace-shell.component.html` |
| Modify | `frontend/src/app/features/workspace/workspace-shell.component.spec.ts` |
| Modify | `frontend/src/app/features/rooms/room-chat/room-chat.ts` |
| Modify | `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts` |

---

### Task 1: BlocksApiService

**Files:**
- Create: `frontend/src/app/core/blocks/blocks.models.ts`
- Create: `frontend/src/app/core/blocks/blocks-api.service.ts`
- Create: `frontend/src/app/core/blocks/blocks-api.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/core/blocks/blocks-api.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BlocksApiService } from './blocks-api.service';

describe('BlocksApiService', () => {
  let service: BlocksApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BlocksApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BlocksApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getBlocks() sends GET /api/blocks', () => {
    service.getBlocks().subscribe();
    const req = http.expectOne('/api/blocks');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('blockUser() sends POST /api/blocks with userId body', () => {
    const userId = 'aaaaaaaa-0000-0000-0000-000000000000';
    service.blockUser(userId).subscribe();
    const req = http.expectOne('/api/blocks');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('unblockUser() sends DELETE /api/blocks/{userId}', () => {
    const userId = 'bbbbbbbb-0000-0000-0000-000000000000';
    service.unblockUser(userId).subscribe();
    const req = http.expectOne(`/api/blocks/${userId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
```

- [ ] **Step 2: Run tests to confirm RED**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --include="**/blocks-api.service.spec.ts" --no-watch --browser=ChromeHeadless 2>&1 | tail -20
```

Expected: FAIL — `BlocksApiService` not found.

- [ ] **Step 3: Create the models file**

```typescript
// frontend/src/app/core/blocks/blocks.models.ts
export interface BlockDto {
  blockedUserId: string;
  blockedUsername: string;
  blockedAvatarUrl: string | null;
  createdAt: string;
}
```

- [ ] **Step 4: Create the service**

```typescript
// frontend/src/app/core/blocks/blocks-api.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { BlockDto } from './blocks.models';

@Injectable({ providedIn: 'root' })
export class BlocksApiService {
  private readonly http = inject(HttpClient);

  getBlocks(): Observable<BlockDto[]> {
    return this.http.get<BlockDto[]>('/api/blocks');
  }

  blockUser(userId: string): Observable<void> {
    return this.http.post<void>('/api/blocks', { userId });
  }

  unblockUser(userId: string): Observable<void> {
    return this.http.delete<void>(`/api/blocks/${userId}`);
  }
}
```

- [ ] **Step 5: Run tests to confirm GREEN**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --include="**/blocks-api.service.spec.ts" --no-watch --browser=ChromeHeadless 2>&1 | tail -20
```

Expected: 3 tests pass.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --no-watch --browser=ChromeHeadless 2>&1 | tail -10
```

Expected: All tests pass (≥81 existing + 3 new = ≥84).

- [ ] **Step 7: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/core/blocks/
git commit -m "feat: add BlocksApiService — getBlocks, blockUser, unblockUser (TDD)"
```

---

### Task 2: BlockedUsersComponent + route

**Files:**
- Create: `frontend/src/app/features/contacts/blocked-users/blocked-users.ts`
- Create: `frontend/src/app/features/contacts/blocked-users/blocked-users.html`
- Create: `frontend/src/app/features/contacts/blocked-users/blocked-users.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/features/contacts/blocked-users/blocked-users.spec.ts
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BlockedUsersComponent } from './blocked-users';
import type { BlockDto } from '../../../core/blocks/blocks.models';

describe('BlockedUsersComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BlockedUsersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders without error', () => {
    const fixture = TestBed.createComponent(BlockedUsersComponent);
    fixture.detectChanges();
    http.expectOne('/api/blocks').flush([]);
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('shows blocked users returned by the API', fakeAsync(() => {
    const fixture = TestBed.createComponent(BlockedUsersComponent);
    fixture.detectChanges();
    const block: BlockDto = {
      blockedUserId: 'aaaaaaaa-0000-0000-0000-000000000000',
      blockedUsername: 'blockedBob',
      blockedAvatarUrl: null,
      createdAt: '2026-04-19T00:00:00Z',
    };
    http.expectOne('/api/blocks').flush([block]);
    tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('blockedBob');
  }));

  it('shows empty state when no users are blocked', fakeAsync(() => {
    const fixture = TestBed.createComponent(BlockedUsersComponent);
    fixture.detectChanges();
    http.expectOne('/api/blocks').flush([]);
    tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No blocked users');
  }));

  it('calls DELETE /api/blocks/{userId} when Unblock is clicked', fakeAsync(() => {
    const fixture = TestBed.createComponent(BlockedUsersComponent);
    fixture.detectChanges();
    const block: BlockDto = {
      blockedUserId: 'bbbbbbbb-0000-0000-0000-000000000000',
      blockedUsername: 'targetUser',
      blockedAvatarUrl: null,
      createdAt: '2026-04-19T00:00:00Z',
    };
    http.expectOne('/api/blocks').flush([block]);
    tick();
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('[data-testid="unblock-bbbbbbbb-0000-0000-0000-000000000000"]') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const unblockReq = http.expectOne('/api/blocks/bbbbbbbb-0000-0000-0000-000000000000');
    expect(unblockReq.request.method).toBe('DELETE');
    unblockReq.flush(null, { status: 204, statusText: 'No Content' });
    tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('targetUser');
  }));
});
```

- [ ] **Step 2: Run tests to confirm RED**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --include="**/blocked-users.spec.ts" --no-watch --browser=ChromeHeadless 2>&1 | tail -20
```

Expected: FAIL — `BlockedUsersComponent` not found.

- [ ] **Step 3: Create the component TypeScript**

```typescript
// frontend/src/app/features/contacts/blocked-users/blocked-users.ts
import { Component, signal } from '@angular/core';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { BlocksApiService } from '../../../core/blocks/blocks-api.service';
import type { BlockDto } from '../../../core/blocks/blocks.models';

@Component({
  selector: 'app-blocked-users',
  standalone: true,
  imports: [],
  templateUrl: './blocked-users.html',
})
export class BlockedUsersComponent {
  private readonly blocksApi = inject(BlocksApiService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly blocks = signal<BlockDto[]>([]);
  readonly unblockingId = signal<string | null>(null);

  constructor() {
    this.loadBlocks();
  }

  unblock(userId: string): void {
    if (this.unblockingId()) return;
    this.unblockingId.set(userId);
    this.blocksApi.unblockUser(userId)
      .pipe(finalize(() => this.unblockingId.set(null)))
      .subscribe({
        next: () => this.blocks.update(list => list.filter(b => b.blockedUserId !== userId)),
        error: () => this.errorMessage.set('Unable to unblock user right now.'),
      });
  }

  private loadBlocks(): void {
    this.isLoading.set(true);
    this.blocksApi.getBlocks()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: blocks => this.blocks.set(blocks),
        error: () => this.errorMessage.set('Unable to load blocked users.'),
      });
  }
}
```

- [ ] **Step 4: Create the component template**

```html
<!-- frontend/src/app/features/contacts/blocked-users/blocked-users.html -->
<div class="flex h-full overflow-hidden bg-surface">
  <div class="flex-1 overflow-y-auto p-8">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-end justify-between mb-6">
        <h1 class="text-2xl font-extrabold tracking-tight text-on-surface">Blocked Users</h1>
      </div>

      @if (isLoading()) {
        <div class="flex justify-center py-12">
          <span class="material-symbols-outlined text-3xl text-outline animate-spin">progress_activity</span>
        </div>
      } @else if (errorMessage()) {
        <p class="text-error text-sm bg-error-container/20 border border-error/20 rounded-xl px-4 py-3">{{ errorMessage() }}</p>
      } @else if (blocks().length === 0) {
        <div class="text-center py-12 text-on-surface-variant">
          <span class="material-symbols-outlined text-4xl mb-4 block">block</span>
          <p class="text-sm">No blocked users.</p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (block of blocks(); track block.blockedUserId) {
            <div class="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 flex items-center gap-4">
              <div class="w-10 h-10 rounded-full bg-surface-container overflow-hidden shrink-0">
                @if (block.blockedAvatarUrl) {
                  <img [src]="block.blockedAvatarUrl" class="w-full h-full object-cover" alt="" />
                } @else {
                  <div class="w-full h-full flex items-center justify-center">
                    <span class="material-symbols-outlined text-on-surface-variant" style="font-size:1.25rem">person</span>
                  </div>
                }
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-bold text-on-surface text-sm truncate">{{ block.blockedUsername }}</p>
                <p class="text-[11px] text-on-surface-variant">Blocked {{ block.createdAt | date:'mediumDate' }}</p>
              </div>
              <button
                class="py-1.5 px-4 bg-surface-container-high text-on-surface text-xs font-bold rounded-lg hover:bg-error hover:text-on-error transition-colors disabled:opacity-50"
                [disabled]="unblockingId() === block.blockedUserId"
                [attr.data-testid]="'unblock-' + block.blockedUserId"
                (click)="unblock(block.blockedUserId)"
              >Unblock</button>
            </div>
          }
        </div>
      }
    </div>
  </div>
</div>
```

Note: `| date:'mediumDate'` requires `DatePipe` in imports. Add it:

Update the `imports` array in the component to include `DatePipe`:

```typescript
// Add to imports in blocked-users.ts:
import { DatePipe } from '@angular/common';

// In @Component decorator:
imports: [DatePipe],
```

- [ ] **Step 5: Register the route in app.routes.ts**

Open `frontend/src/app/app.routes.ts`. Add the import at the top:

```typescript
import { BlockedUsersComponent } from './features/contacts/blocked-users/blocked-users';
```

Add the route inside the `children` array of the `WorkspaceShellComponent` parent, after the `requests` route:

```typescript
      {
        path: 'blocks',
        component: BlockedUsersComponent,
      },
```

The full children array will now include:
```typescript
      { path: '', pathMatch: 'full', redirectTo: 'rooms' },
      { path: 'rooms', component: RoomsHomeComponent },
      { path: 'rooms/:id', component: RoomChatComponent },
      { path: 'sessions', component: SessionsPanelComponent },
      { path: 'settings', component: ProfileSettingsComponent },
      { path: 'contacts', component: ContactsHomeComponent },
      { path: 'requests', component: FriendRequestsComponent },
      { path: 'blocks', component: BlockedUsersComponent },
      { path: 'invitations', component: RoomInvitationsComponent },
      { path: 'messages/:id', component: DirectMessagesComponent },
      { path: 'admin', component: PlatformBansComponent },
      { path: 'rooms/:id/manage', component: ManageRoomComponent },
```

- [ ] **Step 6: Run tests to confirm GREEN**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --include="**/blocked-users.spec.ts" --no-watch --browser=ChromeHeadless 2>&1 | tail -20
```

Expected: 4 tests pass.

- [ ] **Step 7: Run full test suite**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --no-watch --browser=ChromeHeadless 2>&1 | tail -10
```

Expected: All tests pass (≥84 + 4 new = ≥88).

- [ ] **Step 8: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/features/contacts/blocked-users/ frontend/src/app/app.routes.ts
git commit -m "feat: add BlockedUsersComponent at /app/blocks — list + unblock action (TDD)"
```

---

### Task 3: NotificationsApiService

**Files:**
- Create: `frontend/src/app/core/notifications/notifications-api.service.ts`
- Create: `frontend/src/app/core/notifications/notifications-api.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/core/notifications/notifications-api.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { NotificationsApiService } from './notifications-api.service';

describe('NotificationsApiService', () => {
  let service: NotificationsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotificationsApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NotificationsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getUnreadCounts() sends GET /api/unread', () => {
    service.getUnreadCounts().subscribe();
    const req = http.expectOne('/api/unread');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('markRoomRead() sends POST /api/rooms/{id}/read', () => {
    const roomId = 'aaaaaaaa-0000-0000-0000-000000000000';
    service.markRoomRead(roomId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/read`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('markDialogRead() sends POST /api/dialogs/{id}/read', () => {
    const dialogId = 'bbbbbbbb-0000-0000-0000-000000000000';
    service.markDialogRead(dialogId).subscribe();
    const req = http.expectOne(`/api/dialogs/${dialogId}/read`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
```

- [ ] **Step 2: Run tests to confirm RED**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --include="**/notifications-api.service.spec.ts" --no-watch --browser=ChromeHeadless 2>&1 | tail -20
```

Expected: FAIL — `NotificationsApiService` not found.

- [ ] **Step 3: Create the service**

```typescript
// frontend/src/app/core/notifications/notifications-api.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface UnreadContextDto {
  contextType: string;
  contextId: string;
  count: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);

  getUnreadCounts(): Observable<UnreadContextDto[]> {
    return this.http.get<UnreadContextDto[]>('/api/unread');
  }

  markRoomRead(roomId: string): Observable<void> {
    return this.http.post<void>(`/api/rooms/${roomId}/read`, {});
  }

  markDialogRead(dialogId: string): Observable<void> {
    return this.http.post<void>(`/api/dialogs/${dialogId}/read`, {});
  }
}
```

- [ ] **Step 4: Run tests to confirm GREEN**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --include="**/notifications-api.service.spec.ts" --no-watch --browser=ChromeHeadless 2>&1 | tail -20
```

Expected: 3 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --no-watch --browser=ChromeHeadless 2>&1 | tail -10
```

Expected: All tests pass (≥88 + 3 new = ≥91).

- [ ] **Step 6: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/core/notifications/
git commit -m "feat: add NotificationsApiService — getUnreadCounts, markRoomRead, markDialogRead (TDD)"
```

---

### Task 4: Bootstrap unread counts + mark-read on room/dialog enter

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.ts`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.spec.ts`
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.ts`
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts`

**Context:** `WorkspaceShellComponent` already injects `UnreadService`. We add `NotificationsApiService` injection and call `getUnreadCounts()` in `ngOnInit` to seed `UnreadService`. `RoomChatComponent` calls `markRoomRead` after loading messages. `DirectMessagesComponent` calls `markDialogRead` when a dialog is selected.

- [ ] **Step 1: Update WorkspaceShellComponent**

Replace `frontend/src/app/features/workspace/workspace-shell.component.ts` with:

```typescript
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { PresenceService } from '../../core/signalr/presence.service';
import { ChatService } from '../../core/signalr/chat.service';
import { UnreadService } from '../../core/signalr/unread.service';
import { NotificationsApiService } from '../../core/notifications/notifications-api.service';
import { RoomsApiService } from '../../core/rooms/rooms-api.service';
import type { RoomDto } from '../../core/rooms/rooms.models';

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Button],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.scss',
})
export class WorkspaceShellComponent implements OnInit, OnDestroy {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly presence = inject(PresenceService);
  private readonly chat = inject(ChatService);
  readonly unread = inject(UnreadService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly roomsApi = inject(RoomsApiService);

  readonly user = this.authSession.user;
  readonly logoutError = signal('');
  readonly myRooms = signal<RoomDto[]>([]);

  ngOnInit(): void {
    void this.presence.connect();
    void this.chat.connect();
    this.bootstrapData();
  }

  ngOnDestroy(): void {
    void this.presence.disconnect();
    void this.chat.disconnect();
  }

  logout(): void {
    this.logoutError.set('');
    this.authApi.logout().subscribe({
      next: async () => {
        await this.presence.disconnect();
        await this.chat.disconnect();
        this.unread.clearAll();
        this.authSession.clearSession();
        void this.router.navigateByUrl('/auth');
      },
      error: () => {
        this.logoutError.set('Unable to sign out right now. Try again in a moment.');
      },
    });
  }

  private bootstrapData(): void {
    this.roomsApi.getMyRooms().subscribe({
      next: rooms => this.myRooms.set(rooms),
    });
    this.notificationsApi.getUnreadCounts().subscribe({
      next: counts => counts.forEach(c => this.unread.setCount(c.contextType, c.contextId, c.count)),
    });
  }
}
```

Note: `unread` is now `readonly` (public) so the template can call `unread.getCount(...)`.

- [ ] **Step 2: Update the workspace-shell spec**

Open `frontend/src/app/features/workspace/workspace-shell.component.spec.ts`. The existing spec uses `TestBed`. Add providers for `NotificationsApiService` and `RoomsApiService` by adding `provideHttpClient()` and `provideHttpClientTesting()`, then flush the two new HTTP calls. Read the current spec to understand its setup, then add the minimum needed:

The existing spec likely has `provideHttpClient()` and `provideHttpClientTesting()` already (it talks to `AuthApiService`). Add expectations for the two new bootstrap calls inside every `beforeEach` / test that calls `fixture.detectChanges()`. The safest approach is to flush both in `afterEach` via `http.verify()`. Check if any test triggers `ngOnInit` and add:

```typescript
// After fixture.detectChanges() in each test that mounts the component:
http.expectOne('/api/rooms/my').flush([]);
http.expectOne('/api/unread').flush([]);
```

Read the spec first with `cat frontend/src/app/features/workspace/workspace-shell.component.spec.ts`, then add the two flush calls to every test that calls `fixture.detectChanges()` on the component. **Do not rewrite the entire spec** — surgical additions only.

- [ ] **Step 3: Update RoomChatComponent to mark room as read**

In `frontend/src/app/features/rooms/room-chat/room-chat.ts`:

1. Inject `NotificationsApiService`:
   ```typescript
   import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
   // In class:
   private readonly notificationsApi = inject(NotificationsApiService);
   ```

2. Inside the `loadRoom` method, after messages are loaded successfully, add the mark-read call:

Find the existing `loadRoom` private method. After `next: msgs => this.messages.set(msgs),` add:
```typescript
              .subscribe({
                next: msgs => {
                  this.messages.set(msgs);
                  this.notificationsApi.markRoomRead(id).subscribe();
                  this.unread.setCount('room', id, 0);
                },
```

But `unread` isn't injected in RoomChatComponent. Inject it:
```typescript
import { UnreadService } from '../../../core/signalr/unread.service';
// In class:
private readonly unread = inject(UnreadService);
```

Full updated `loadRoom` private method (only this method changes):
```typescript
  private loadRoom(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.roomsApi.getRoom(id).subscribe({
      next: room => {
        this.room.set(room);
        this.roomsApi.getMessages(id)
          .pipe(finalize(() => this.isLoading.set(false)))
          .subscribe({
            next: msgs => {
              this.messages.set(msgs);
              this.notificationsApi.markRoomRead(id).subscribe();
              this.unread.setCount('room', id, 0);
            },
            error: () => this.errorMessage.set('Unable to load messages.'),
          });
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Room not found or access denied.');
      },
    });
  }
```

- [ ] **Step 4: Update DirectMessagesComponent to mark dialog as read**

In `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts`, find the method that loads messages for a dialog (e.g., `loadMessages` or `selectDialog`). After messages load successfully, add:

```typescript
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';
// Inject in class:
private readonly notificationsApi = inject(NotificationsApiService);
private readonly unread = inject(UnreadService);
```

Then wherever the component loads dialog messages (the `next:` callback for `dialogsApi.getMessages(id)`), add:
```typescript
this.notificationsApi.markDialogRead(id).subscribe();
this.unread.setCount('dialog', id, 0);
```

First read the current DirectMessagesComponent file to find the exact message-loading location:
```bash
cat frontend/src/app/features/dialogs/direct-messages/direct-messages.ts
```

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --no-watch --browser=ChromeHeadless 2>&1 | tail -15
```

Expected: All tests pass. Fix any workspace-shell spec failures from the new HTTP calls.

- [ ] **Step 6: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/features/workspace/workspace-shell.component.ts \
        frontend/src/app/features/workspace/workspace-shell.component.spec.ts \
        frontend/src/app/features/rooms/room-chat/room-chat.ts \
        frontend/src/app/features/dialogs/direct-messages/direct-messages.ts
git commit -m "feat: bootstrap unread counts on workspace init; mark room/dialog read on enter"
```

---

### Task 5: Dynamic sidebar room list with unread badges

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.html`

**Context:** `WorkspaceShellComponent` now has `myRooms` signal (Task 4) and `unread` service (public). The sidebar currently has 3 static room names hard-coded. Replace them with a dynamic `@for` loop over `myRooms()`, showing each room name and an unread badge when `unread.getCount('room', room.id) > 0`. Add a "Blocked Users" nav link in the top nav.

- [ ] **Step 1: Replace the static sidebar room list**

In `frontend/src/app/features/workspace/workspace-shell.component.html`, find the `pl-9 space-y-1` div that contains the 3 static room `div` elements:

```html
          <div class="pl-9 space-y-1">
            <div class="p-2 bg-surface-container-lowest text-on-surface font-bold rounded-lg cursor-pointer text-sm">#engineering-room</div>
            <div class="p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm">#design-ops</div>
            <div class="p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm">#product-roadmap</div>
          </div>
```

Replace it with:

```html
          <div class="pl-9 space-y-1">
            @for (room of myRooms(); track room.id) {
              <a
                [routerLink]="['/app/rooms', room.id]"
                routerLinkActive="bg-surface-container-lowest text-on-surface font-bold"
                class="p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm rounded-lg flex items-center justify-between"
              >#{{ room.name }}
                @if (unread.getCount('room', room.id) > 0) {
                  <span class="bg-primary text-on-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                    {{ unread.getCount('room', room.id) }}
                  </span>
                }
              </a>
            }
            @if (myRooms().length === 0) {
              <div class="p-2 text-on-surface-variant text-xs italic">No rooms joined</div>
            }
          </div>
```

- [ ] **Step 2: Add "Blocked Users" nav link to the top nav**

Find the top nav section in workspace-shell.component.html. It currently has these links:
```html
        <a routerLink="/app/rooms" ...>Public Rooms</a>
        <a routerLink="/app/invitations" ...>Invitations</a>
        <a routerLink="/app/contacts" ...>Contacts</a>
        <a routerLink="/app/admin" ...>Admin</a>
        <a routerLink="/app/sessions" ...>Sessions</a>
```

Add "Blocked" after "Contacts":
```html
        <a routerLink="/app/contacts" routerLinkActive="border-b-2 border-white text-white" class="text-outline hover:text-white transition-colors pb-1">Contacts</a>
        <a routerLink="/app/blocks" routerLinkActive="border-b-2 border-white text-white" class="text-outline hover:text-white transition-colors pb-1">Blocked</a>
        <a routerLink="/app/admin" routerLinkActive="border-b-2 border-white text-white" class="text-outline hover:text-white transition-colors pb-1">Admin</a>
```

- [ ] **Step 3: Verify template compiles**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng build --configuration development 2>&1 | tail -20
```

Expected: Build succeeds, 0 errors.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --no-watch --browser=ChromeHeadless 2>&1 | tail -10
```

Expected: All tests pass (≥91 from prior tasks). Fix any workspace-shell spec failures from new template bindings (the spec may need `RouterLinkActive` or `RouterLink` in the testing module — but since the component is `standalone: true` and imports them directly, `provideRouter([])` in TestBed is sufficient).

- [ ] **Step 5: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/features/workspace/workspace-shell.component.html
git commit -m "feat: dynamic sidebar room list with unread count badges; add Blocked nav link"
```

---

### Task 6: Update DEVELOPMENT_LOG.md

**Files:**
- Modify: `DEVELOPMENT_LOG.md`

- [ ] **Step 1: Append Phase 4h summary**

Append to the end of `DEVELOPMENT_LOG.md` (after the last entry, continuing the task numbering — check the last T-number and use the next sequential number):

```
`[2026-04-19 T{N}]` | **[Phase 4h] Blocks UI + Unread Badges — complete** | Implemented full Phase 4h via subagent-driven development (5 tasks). (T1) BlocksApiService — `core/blocks/blocks.models.ts` + `blocks-api.service.ts` + spec (3 tests: getBlocks GET, blockUser POST with body, unblockUser DELETE); (T2) BlockedUsersComponent at route `/app/blocks` — list blocked users with Unblock action, `data-testid="unblock-{userId}"` on each button, 4 TDD tests, added route to app.routes.ts; (T3) NotificationsApiService — `core/notifications/notifications-api.service.ts` + spec (3 tests: getUnreadCounts GET, markRoomRead POST, markDialogRead POST); (T4) Bootstrap unread counts in WorkspaceShellComponent.ngOnInit (calls GET /api/rooms/my and GET /api/unread, seeds UnreadService); RoomChatComponent marks room read after messages load; DirectMessagesComponent marks dialog read after messages load; (T5) Dynamic sidebar room list replaces static mock — `@for (room of myRooms())` with per-room unread count badge from `unread.getCount('room', room.id)`; "Blocked" nav link added. Final test count: ≥91 Angular tests passing. | Commits per task above. | **[BUILD]**
```

- [ ] **Step 2: Commit the log**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add DEVELOPMENT_LOG.md
git commit -m "docs: add Phase 4h completion entry to DEVELOPMENT_LOG.md"
```

---

## Self-Review

**Spec coverage check against T115 gap list:**
- `BlocksApiService` frontend + blocked-users list screen — 0% → ✅ Tasks 1 + 2
- Unread badge wiring in sidebar — UnreadService exists, UI display 0% → ✅ Tasks 3 + 4 + 5
- `GET /api/blocks`, `POST /api/blocks`, `DELETE /api/blocks/{userId}` — ✅ Task 1
- Route `/app/blocks` — ✅ Task 2
- Bootstrap `GET /api/unread` on login — ✅ Task 4
- `POST /rooms/{id}/read` called on room enter — ✅ Task 4
- `POST /dialogs/{id}/read` called on dialog enter — ✅ Task 4

**Placeholder scan:** No TBD/TODO. Every step has concrete code. The one ambiguity is the DirectMessagesComponent edit in Task 4 Step 4 (instructed to read the file first to find the exact insertion point — this is intentional, not a placeholder).

**Type consistency:**
- `BlockDto.blockedUserId` (string) used consistently in service, template (`data-testid="unblock-" + block.blockedUserId`), and filter (`b.blockedUserId !== userId`). ✅
- `UnreadContextDto.contextType` / `.contextId` / `.count` match `NotificationsApiService` return type and `UnreadService.setCount(contextType, contextId, count)` signature. ✅
- `RoomDto.id` and `RoomDto.name` used in sidebar template — both exist in `rooms.models.ts`. ✅
- `unread.getCount('room', room.id)` — `getCount` is public in `UnreadService`. ✅
