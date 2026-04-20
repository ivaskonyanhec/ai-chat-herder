# Sidebar Redesign + Navbar Avatar Fix + Icon Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the sidebar to use a wider mini-collapse with initials/icons, fix the broken navbar avatar (`<img src>` against an auth-gated API), add per-item sidebar hide, and let users choose from 12 predefined vector icons as their avatar.

**Architecture:** A new standalone `AvatarComponent` centralises all avatar rendering strategies (file API blob fetch, `icon:*` scheme, plain URL, initials fallback); this component is wired into the navbar, sidebar contacts, and profile settings display. The sidebar gains a `hiddenSidebarItems` signal (localStorage-backed) and computed filtered views of rooms/contacts. The icon picker in profile settings calls `usersApi.patchMe('icon:<name>')`, relying on the existing flexible `PATCH /api/users/me` endpoint.

**Tech Stack:** Angular 21 (Signals, standalone components, `input()`, `toObservable`, `switchMap`), Tailwind CSS, Material Symbols, Vitest + Angular TestBed, Playwright E2E.

---

## File Map

| Path | Action | Purpose |
|------|--------|---------|
| `frontend/src/app/shared/avatar/avatar.component.ts` | Create | Auth-aware avatar renderer |
| `frontend/src/app/shared/avatar/avatar.component.html` | Create | Template for all 4 avatar modes |
| `frontend/src/app/shared/avatar/avatar.component.spec.ts` | Create | Unit tests for avatar modes |
| `frontend/src/app/core/auth/auth-session.service.ts` | Modify | Add `updateAvatarUrl()` method |
| `frontend/src/app/features/workspace/workspace-shell.component.ts` | Modify | Import AvatarComponent; add `hiddenSidebarItems`, filtered computed signals, `toggleHideItem()`, `resetHiddenItems()` |
| `frontend/src/app/features/workspace/workspace-shell.component.html` | Modify | Replace navbar `<img>`, add initials in collapsed rooms, add hide buttons in expanded rooms, wire Slack-style active indicator |
| `frontend/src/app/features/workspace/workspace-shell.component.spec.ts` | Create | Unit tests for hide/reset logic |
| `frontend/src/app/features/profile/profile-settings/profile-settings.ts` | Modify | Add `PREDEFINED_ICONS`, `selectIcon()`, call `authSession.updateAvatarUrl()` |
| `frontend/src/app/features/profile/profile-settings/profile-settings.html` | Modify | Add icon picker grid; wire AvatarComponent for live preview |
| `e2e/tests/12-avatar-icons.spec.ts` | Create | E2E: icon selection persists; sidebar hide persists across navigation |
| `e2e/tests/uat/10-sidebar-profile.uat.spec.ts` | Create | UAT: full sidebar hide flow + icon picker UX walk-through |

---

### Task 1: Shared AvatarComponent

**Files:**
- Create: `frontend/src/app/shared/avatar/avatar.component.ts`
- Create: `frontend/src/app/shared/avatar/avatar.component.html`
- Create: `frontend/src/app/shared/avatar/avatar.component.spec.ts`

- [ ] **Step 1: Write the failing spec**

```ts
// frontend/src/app/shared/avatar/avatar.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AvatarComponent } from './avatar.component';
import { FilesApiService } from '../../core/files/files-api.service';

describe('AvatarComponent', () => {
  const mockFiles = { getFileBlob: vi.fn() };

  beforeEach(() => {
    mockFiles.getFileBlob.mockReturnValue(of(new Blob(['x'], { type: 'image/png' })));
    TestBed.configureTestingModule({
      imports: [AvatarComponent],
      providers: [{ provide: FilesApiService, useValue: mockFiles }],
    });
    vi.clearAllMocks();
  });

  it('shows initials when avatarUrl is null', async () => {
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('avatarUrl', null);
    fixture.componentRef.setInput('username', 'Alice');
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement.querySelector('[data-testid="avatar-initials"]');
    expect(el).toBeTruthy();
    expect(el.textContent.trim()).toBe('A');
  });

  it('shows Material Symbol when avatarUrl is icon:star', async () => {
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('avatarUrl', 'icon:star');
    fixture.componentRef.setInput('username', 'Bob');
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement.querySelector('[data-testid="avatar-icon"]');
    expect(el).toBeTruthy();
    expect(el.textContent.trim()).toBe('star');
  });

  it('calls FilesApiService.getFileBlob for /api/files/* URL', async () => {
    mockFiles.getFileBlob.mockReturnValue(of(new Blob()));
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('avatarUrl', '/api/files/abc-123');
    fixture.componentRef.setInput('username', 'Charlie');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mockFiles.getFileBlob).toHaveBeenCalledWith('abc-123');
  });

  it('renders <img> for a plain external URL', async () => {
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('avatarUrl', 'https://example.com/pic.png');
    fixture.componentRef.setInput('username', 'Dave');
    fixture.detectChanges();
    await fixture.whenStable();
    const img = fixture.nativeElement.querySelector('[data-testid="avatar-img"]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('example.com');
  });

  it('falls back to initials while blob is loading', () => {
    mockFiles.getFileBlob.mockReturnValue(new Promise(() => {})); // never resolves
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('avatarUrl', '/api/files/xyz');
    fixture.componentRef.setInput('username', 'Eve');
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="avatar-initials"]');
    expect(el).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run spec to verify it fails**

```bash
cd frontend && npx ng test --include="**/avatar.component.spec.ts" --watch=false 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module './avatar.component'`

- [ ] **Step 3: Create `avatar.component.ts`**

```ts
// frontend/src/app/shared/avatar/avatar.component.ts
import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { FilesApiService } from '../../core/files/files-api.service';

const PALETTE = ['#7c3aed','#2563eb','#0891b2','#16a34a','#ca8a04','#dc2626','#db2777','#9333ea'];

function hashColor(str: string): string {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return PALETTE[h % PALETTE.length];
}

@Component({
  selector: 'app-avatar',
  standalone: true,
  templateUrl: './avatar.component.html',
})
export class AvatarComponent {
  private readonly filesApi = inject(FilesApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly avatarUrl = input<string | null>(null);
  readonly username = input<string>('?');
  // Pixel size — avoids Tailwind dynamic class purging
  readonly sizePx = input<number>(32);

  readonly objectUrl = signal<string | null>(null);
  private blobUrl: string | null = null;

  readonly mode = computed<'initials' | 'icon' | 'blob' | 'img'>(() => {
    const url = this.avatarUrl();
    if (!url) return 'initials';
    if (url.startsWith('icon:')) return 'icon';
    if (url.startsWith('/api/files/')) return 'blob';
    return 'img';
  });

  readonly iconName = computed(() => this.avatarUrl()?.startsWith('icon:') ? this.avatarUrl()!.slice(5) : '');
  readonly initials = computed(() => (this.username()[0] ?? '?').toUpperCase());
  readonly bgColor = computed(() => hashColor(this.username()));
  readonly textSizePx = computed(() => Math.max(10, Math.round(this.sizePx() * 0.44)));

  constructor() {
    toObservable(this.avatarUrl)
      .pipe(
        switchMap(url => {
          this.revoke();
          if (!url?.startsWith('/api/files/')) return of(null);
          const id = url.slice('/api/files/'.length);
          return this.filesApi.getFileBlob(id).pipe(
            catchError(() => of(null)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(blob => {
        if (blob) {
          this.blobUrl = URL.createObjectURL(blob);
          this.objectUrl.set(this.blobUrl);
        } else {
          this.objectUrl.set(null);
        }
      });
    this.destroyRef.onDestroy(() => this.revoke());
  }

  private revoke(): void {
    if (!this.blobUrl) return;
    URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
    this.objectUrl.set(null);
  }
}
```

- [ ] **Step 4: Create `avatar.component.html`**

```html
<!-- frontend/src/app/shared/avatar/avatar.component.html -->
<div class="rounded-full overflow-hidden flex items-center justify-center shrink-0 select-none"
     [style.width.px]="sizePx()"
     [style.height.px]="sizePx()">
  @switch (mode()) {
    @case ('initials') {
      <div data-testid="avatar-initials"
           class="w-full h-full flex items-center justify-center text-white font-bold"
           [style.background-color]="bgColor()"
           [style.font-size.px]="textSizePx()">
        {{ initials() }}
      </div>
    }
    @case ('icon') {
      <div class="w-full h-full flex items-center justify-center text-white"
           [style.background-color]="bgColor()">
        <span class="material-symbols-outlined"
              data-testid="avatar-icon"
              [style.font-size.px]="textSizePx()">{{ iconName() }}</span>
      </div>
    }
    @case ('blob') {
      @if (objectUrl()) {
        <img data-testid="avatar-img"
             [src]="objectUrl()!"
             [alt]="username()"
             class="w-full h-full object-cover" />
      } @else {
        <!-- loading: show initials until blob resolves -->
        <div data-testid="avatar-initials"
             class="w-full h-full flex items-center justify-center text-white font-bold"
             [style.background-color]="bgColor()"
             [style.font-size.px]="textSizePx()">
          {{ initials() }}
        </div>
      }
    }
    @case ('img') {
      <img data-testid="avatar-img"
           [src]="avatarUrl()!"
           [alt]="username()"
           class="w-full h-full object-cover" />
    }
  }
</div>
```

- [ ] **Step 5: Run spec to verify it passes**

```bash
cd frontend && npx ng test --include="**/avatar.component.spec.ts" --watch=false 2>&1 | tail -10
```

Expected: `5 passed`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/shared/avatar/
git commit -m "feat: add shared AvatarComponent with auth-aware blob fetch and icon: scheme support"
```

---

### Task 2: Add `updateAvatarUrl()` to AuthSessionService + wire AvatarComponent into navbar

**Files:**
- Modify: `frontend/src/app/core/auth/auth-session.service.ts`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.ts`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.html`

- [ ] **Step 1: Add `updateAvatarUrl` to `auth-session.service.ts`**

Open `frontend/src/app/core/auth/auth-session.service.ts`. After `clearSession()` (line 24), add:

```ts
updateAvatarUrl(avatarUrl: string | null): void {
  this.sessionState.update(s => {
    if (!s?.user) return s;
    return { ...s, user: { ...s.user, avatarUrl } };
  });
}
```

- [ ] **Step 2: Import AvatarComponent in `workspace-shell.component.ts`**

In `workspace-shell.component.ts`, add to the imports array in `@Component`:

```ts
import { AvatarComponent } from '../../shared/avatar/avatar.component';
```

Change the `@Component` decorator:
```ts
@Component({
  selector: 'app-workspace-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Button, AvatarComponent],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.scss',
})
```

- [ ] **Step 3: Replace broken `<img>` in navbar (`workspace-shell.component.html` lines 29–33)**

Replace:
```html
<img
  [src]="user()?.avatarUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuBoE1AAIFrnyj9F8mxOop8uxCsIRdOxzhWtnxjn7NugcZYLy5I0Dpd7Xa9meXu5UDQAGvY5xt3Hb0oHZJ-RtruBAq2ha-SdwkN6yVjMRlK6os9_26BZMepR6qZxG_G6zRuAyXw4qT1BseTQJxDpjswRqkQCvFbbaVFsomxcZ6ubiGBy4IaGBVjd0ikVTb_cBNYZO7nZkxH8LEctIAAHPuiio0Qfy3pKTJkOdZSHFJE_AxtUk0itobW_nenKACmDvvyl5JeG7Of_yMQ'"
  alt="User profile"
  class="h-8 w-8 rounded-full border border-on-primary/30 object-cover"
/>
```

With:
```html
<a routerLink="/app/settings" class="rounded-full border border-on-primary/30 hover:opacity-80 transition-opacity"
   data-testid="navbar-avatar">
  <app-avatar
    [avatarUrl]="user()?.avatarUrl ?? null"
    [username]="user()?.username ?? '?'"
    [sizePx]="32"
  />
</a>
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
cd frontend && npx ng build --configuration=development 2>&1 | grep -E "error|warning" | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/auth/auth-session.service.ts \
        frontend/src/app/features/workspace/workspace-shell.component.ts \
        frontend/src/app/features/workspace/workspace-shell.component.html
git commit -m "fix: replace broken navbar img with AvatarComponent; add updateAvatarUrl to AuthSessionService"
```

---

### Task 3: Sidebar mini-collapse redesign (wider, room initials, Slack-inspired active indicators)

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.html`

The changes: `w-12` → `w-16` (64 px); collapsed rooms show colored initials circles (first letter of room name) instead of generic Material Symbol icons; expanded items get a left-border active indicator; contacts in collapsed state already show initials (keep as-is).

- [ ] **Step 1: Change collapsed sidebar width**

In `workspace-shell.component.html` line 49, change:
```html
[class.w-12]="sidebarCollapsed()"
```
to:
```html
[class.w-16]="sidebarCollapsed()"
```

- [ ] **Step 2: Replace collapsed public-rooms with initials circles**

Find the collapsed public-rooms block (lines ~136–153):
```html
@if (sidebarCollapsed()) {
  <div class="flex flex-col items-center gap-1 py-1" data-testid="public-rooms-section">
    @for (room of publicRooms(); track room.id) {
      <a [routerLink]="['/app/rooms', room.id]"
         routerLinkActive="border-l-2 border-primary bg-surface-container-lowest"
         class="relative w-9 h-9 flex items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high transition-colors"
         [title]="room.name"
         [attr.data-testid]="'public-room-' + room.id">
        <span class="material-symbols-outlined text-[17px] text-primary" data-testid="public-room-icon">public</span>
        @let count = getUnreadCount('room', room.id);
        @if (count > 0) {
          <span class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary"></span>
        }
      </a>
    }
  </div>
}
```

Replace with:
```html
@if (sidebarCollapsed()) {
  <div class="flex flex-col items-center gap-1 py-1" data-testid="public-rooms-section">
    @for (room of visiblePublicRooms(); track room.id) {
      <a [routerLink]="['/app/rooms', room.id]"
         routerLinkActive="ring-2 ring-primary"
         class="relative w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
         [title]="room.name"
         [attr.data-testid]="'public-room-' + room.id">
        <app-avatar [avatarUrl]="null" [username]="room.name" [sizePx]="36" />
        @let count = getUnreadCount('room', room.id);
        @if (count > 0) {
          <span class="absolute top-0 right-0 w-2 h-2 rounded-full bg-primary border border-surface-container"></span>
        }
      </a>
    }
  </div>
}
```

- [ ] **Step 3: Replace collapsed private-rooms with initials circles**

Find the collapsed private-rooms block (lines ~189–206):
```html
@if (sidebarCollapsed()) {
  <div class="flex flex-col items-center gap-1 py-1" data-testid="private-rooms-section">
    @for (room of privateRooms(); track room.id) {
      <a [routerLink]="['/app/rooms', room.id]"
         routerLinkActive="border-l-2 border-primary bg-surface-container-lowest"
         class="relative w-9 h-9 flex items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high transition-colors"
         [title]="room.name"
         [attr.data-testid]="'private-room-' + room.id">
        <span class="material-symbols-outlined text-[17px] text-on-surface-variant" data-testid="private-room-icon">lock</span>
        @let count = getUnreadCount('room', room.id);
        @if (count > 0) {
          <span class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary"></span>
        }
      </a>
    }
  </div>
}
```

Replace with:
```html
@if (sidebarCollapsed()) {
  <div class="flex flex-col items-center gap-1 py-1" data-testid="private-rooms-section">
    @for (room of visiblePrivateRooms(); track room.id) {
      <a [routerLink]="['/app/rooms', room.id]"
         routerLinkActive="ring-2 ring-primary"
         class="relative w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
         [title]="room.name"
         [attr.data-testid]="'private-room-' + room.id">
        <app-avatar [avatarUrl]="null" [username]="room.name" [sizePx]="36" />
        @let count = getUnreadCount('room', room.id);
        @if (count > 0) {
          <span class="absolute top-0 right-0 w-2 h-2 rounded-full bg-primary border border-surface-container"></span>
        }
      </a>
    }
  </div>
}
```

- [ ] **Step 4: Add Slack-style left-border active indicator to expanded rooms**

In the expanded public-rooms `@for` block, change `routerLinkActive`:
```html
routerLinkActive="border-l-2 border-primary bg-surface-container-lowest text-on-surface font-bold"
```
(This is already close; just verify the binding matches — look for the expanded `data-testid="public-rooms-section"` block. The existing value is `"bg-surface-container-lowest text-on-surface font-bold"`. Change to `"border-l-2 border-primary bg-surface-container-lowest text-on-surface font-bold"`.)

Do the same for expanded private rooms — change their `routerLinkActive` from:
```html
routerLinkActive="bg-surface-container-lowest text-on-surface font-bold"
```
to:
```html
routerLinkActive="border-l-2 border-primary bg-surface-container-lowest text-on-surface font-bold"
```

Also update the expanded public-rooms `@for` to use `visiblePublicRooms()` and expanded private-rooms to use `visiblePrivateRooms()` (the computed filtered signals added in Task 4).

- [ ] **Step 5: Update collapsed contacts section to use `visibleFriends()`**

Both the expanded and collapsed contacts sections (`@for (friend of friends(); ...)`) — change the iterable to `visibleFriends()`. (Define `visibleFriends` in Task 4 Step 1.)

- [ ] **Step 6: Build to verify no errors**

```bash
cd frontend && npx ng build --configuration=development 2>&1 | grep -E "error TS" | head -20
```

Expected: no TypeScript errors (will have runtime errors until Task 4 adds the computed signals)

---

### Task 4: Per-item sidebar hide + reset

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.ts`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.html`
- Create: `frontend/src/app/features/workspace/workspace-shell.component.spec.ts`

**Key: hide keys are `room:{id}` and `contact:{userId}`. Stored as JSON array in localStorage.**

- [ ] **Step 1: Write failing spec**

```ts
// frontend/src/app/features/workspace/workspace-shell.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { provideRouter } from '@angular/router';
import { WorkspaceShellComponent } from './workspace-shell.component';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { PresenceService } from '../../core/signalr/presence.service';
import { ChatService } from '../../core/signalr/chat.service';
import { UnreadService } from '../../core/signalr/unread.service';
import { NotificationsApiService } from '../../core/notifications/notifications-api.service';
import { RoomsApiService } from '../../core/rooms/rooms-api.service';
import { FriendsApiService } from '../../core/friends/friends-api.service';
import { InvitationsApiService } from '../../core/invitations/invitations-api.service';
import { FilesApiService } from '../../core/files/files-api.service';

function buildTestBed() {
  TestBed.configureTestingModule({
    imports: [WorkspaceShellComponent],
    providers: [
      provideRouter([]),
      { provide: AuthSessionService, useValue: { user: signal(null), isAuthenticated: signal(true) } },
      { provide: AuthApiService, useValue: { logout: () => of(void 0) } },
      { provide: PresenceService, useValue: { connect: vi.fn(), disconnect: vi.fn(), presenceMap: signal(new Map()), addedToRoom: signal(null), invitationReceived: signal(null) } },
      { provide: ChatService, useValue: { connect: vi.fn(), disconnect: vi.fn(), lastDmEvent: signal(null) } },
      { provide: UnreadService, useValue: { unreadCounts: signal({}), getCount: () => 0, setCount: vi.fn(), clearAll: vi.fn() } },
      { provide: NotificationsApiService, useValue: { getUnreadCounts: () => of([]) } },
      { provide: RoomsApiService, useValue: { getMyRooms: () => of([]) } },
      { provide: FriendsApiService, useValue: { getFriends: () => of([]) } },
      { provide: InvitationsApiService, useValue: { getMyInvitations: () => of([]) } },
      { provide: FilesApiService, useValue: { getFileBlob: () => of(new Blob()) } },
    ],
  });
}

describe('WorkspaceShellComponent — hide logic', () => {
  beforeEach(() => {
    localStorage.removeItem('sidebar_hidden');
  });

  it('starts with no hidden items', () => {
    buildTestBed();
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    expect(fixture.componentInstance.hiddenSidebarItems()).toEqual([]);
  });

  it('toggleHideItem adds a key to hidden items', () => {
    buildTestBed();
    const comp = TestBed.createComponent(WorkspaceShellComponent).componentInstance;
    comp.toggleHideItem('room:abc');
    expect(comp.hiddenSidebarItems()).toContain('room:abc');
  });

  it('toggleHideItem removes a key that is already hidden', () => {
    buildTestBed();
    const comp = TestBed.createComponent(WorkspaceShellComponent).componentInstance;
    comp.toggleHideItem('room:abc');
    comp.toggleHideItem('room:abc');
    expect(comp.hiddenSidebarItems()).not.toContain('room:abc');
  });

  it('resetHiddenItems clears all hidden keys', () => {
    buildTestBed();
    const comp = TestBed.createComponent(WorkspaceShellComponent).componentInstance;
    comp.toggleHideItem('room:abc');
    comp.toggleHideItem('contact:xyz');
    comp.resetHiddenItems();
    expect(comp.hiddenSidebarItems()).toEqual([]);
  });

  it('persists hidden items to localStorage', () => {
    buildTestBed();
    const comp = TestBed.createComponent(WorkspaceShellComponent).componentInstance;
    comp.toggleHideItem('room:def');
    const stored = JSON.parse(localStorage.getItem('sidebar_hidden') ?? '[]');
    expect(stored).toContain('room:def');
  });
});
```

- [ ] **Step 2: Run spec to verify it fails**

```bash
cd frontend && npx ng test --include="**/workspace-shell.component.spec.ts" --watch=false 2>&1 | tail -15
```

Expected: FAIL — `hiddenSidebarItems`, `toggleHideItem`, `resetHiddenItems` do not exist

- [ ] **Step 3: Add hide logic to `workspace-shell.component.ts`**

After line 63 (`readonly searchQuery = signal('');`), add:

```ts
readonly hiddenSidebarItems = signal<string[]>(
  JSON.parse(localStorage.getItem('sidebar_hidden') ?? '[]') as string[]
);

readonly visiblePublicRooms = computed(() => {
  const hidden = this.hiddenSidebarItems();
  return this.publicRooms().filter(r => !hidden.includes('room:' + r.id));
});

readonly visiblePrivateRooms = computed(() => {
  const hidden = this.hiddenSidebarItems();
  return this.privateRooms().filter(r => !hidden.includes('room:' + r.id));
});

readonly visibleFriends = computed(() => {
  const hidden = this.hiddenSidebarItems();
  return this.friends().filter(f => !hidden.includes('contact:' + f.userId));
});
```

After `toggleSidebar()`, add:

```ts
toggleHideItem(key: string): void {
  this.hiddenSidebarItems.update(items => {
    const next = items.includes(key) ? items.filter(k => k !== key) : [...items, key];
    localStorage.setItem('sidebar_hidden', JSON.stringify(next));
    return next;
  });
}

resetHiddenItems(): void {
  this.hiddenSidebarItems.set([]);
  localStorage.removeItem('sidebar_hidden');
}
```

- [ ] **Step 4: Run spec to verify it passes**

```bash
cd frontend && npx ng test --include="**/workspace-shell.component.spec.ts" --watch=false 2>&1 | tail -10
```

Expected: `5 passed`

- [ ] **Step 5: Add hide button to expanded room items in the template**

In `workspace-shell.component.html`, in the expanded public-rooms `@for` block, wrap the existing room link to add a group with a hover hide button. Replace the single `<a>` with a `<div class="group relative">` containing the link + the hide button:

```html
@if (!sidebarCollapsed() && publicRoomsExpanded()) {
  <div class="pl-9 space-y-1" data-testid="public-rooms-section">
    @for (room of visiblePublicRooms(); track room.id) {
      <div class="group relative flex items-center">
        <a [routerLink]="['/app/rooms', room.id]"
           routerLinkActive="border-l-2 border-primary bg-surface-container-lowest text-on-surface font-bold"
           class="flex flex-1 items-center justify-between gap-2 p-2 bg-surface-container/40 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer text-sm rounded-lg"
           [attr.data-testid]="'public-room-' + room.id">
          <span class="flex items-center gap-2 min-w-0">
            <span class="material-symbols-outlined text-[17px] text-primary shrink-0" data-testid="public-room-icon">public</span>
            <span class="truncate">{{ room.name }}</span>
          </span>
          @let count = getUnreadCount('room', room.id);
          @if (count > 0) {
            <span class="ml-1 shrink-0 min-w-[1.25rem] h-5 px-1 bg-primary text-on-primary text-[10px] font-black rounded-full flex items-center justify-center"
                  [attr.data-testid]="'unread-badge-' + room.id">{{ count }}</span>
          }
        </a>
        <button type="button"
                class="hidden group-hover:flex ml-1 w-5 h-5 items-center justify-center rounded text-on-surface-variant hover:text-error hover:bg-surface-container-high shrink-0"
                [title]="'Hide ' + room.name"
                [attr.data-testid]="'hide-room-' + room.id"
                (click)="toggleHideItem('room:' + room.id)">
          <span class="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>
    } @empty {
      <div class="p-2 text-on-surface-variant text-sm italic">No public rooms</div>
    }
  </div>
}
```

Apply the same pattern to the expanded private-rooms `@for` block (change `'room:' + room.id`, `data-testid="hide-room-"`, icon `lock` → keep as is):

```html
@if (!sidebarCollapsed() && privateRoomsExpanded()) {
  <div class="pl-9 space-y-1" data-testid="private-rooms-section">
    @for (room of visiblePrivateRooms(); track room.id) {
      <div class="group relative flex items-center">
        <a [routerLink]="['/app/rooms', room.id]"
           routerLinkActive="border-l-2 border-primary bg-surface-container-lowest text-on-surface font-bold"
           class="flex flex-1 items-center justify-between gap-2 p-2 bg-surface-container-high/70 text-on-surface-variant hover:bg-surface-container-lowest hover:text-on-surface cursor-pointer text-sm rounded-lg"
           [attr.data-testid]="'private-room-' + room.id">
          <span class="flex items-center gap-2 min-w-0">
            <span class="material-symbols-outlined text-[17px] text-on-surface-variant shrink-0" data-testid="private-room-icon">lock</span>
            <span class="truncate">{{ room.name }}</span>
          </span>
          @let count = getUnreadCount('room', room.id);
          @if (count > 0) {
            <span class="ml-1 shrink-0 min-w-[1.25rem] h-5 px-1 bg-primary text-on-primary text-[10px] font-black rounded-full flex items-center justify-center"
                  [attr.data-testid]="'unread-badge-' + room.id">{{ count }}</span>
          }
        </a>
        <button type="button"
                class="hidden group-hover:flex ml-1 w-5 h-5 items-center justify-center rounded text-on-surface-variant hover:text-error hover:bg-surface-container-high shrink-0"
                [title]="'Hide ' + room.name"
                [attr.data-testid]="'hide-room-' + room.id"
                (click)="toggleHideItem('room:' + room.id)">
          <span class="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>
    } @empty {
      <div class="p-2 text-on-surface-variant text-sm italic">No private rooms</div>
    }
  </div>
}
```

Also add hide buttons to expanded contacts list — same `group relative` wrapper pattern, `(click)="toggleHideItem('contact:' + friend.userId)"`, `data-testid="'hide-contact-' + friend.username"`.

- [ ] **Step 6: Add "Reset hidden items" link at bottom of expanded sidebar**

Just before the `<!-- ── Spacer ──` div, insert:

```html
@if (!sidebarCollapsed() && hiddenSidebarItems().length > 0) {
  <div class="px-4 mt-2">
    <button type="button"
            class="text-[10px] text-on-surface-variant hover:text-on-surface transition-colors underline underline-offset-2"
            data-testid="reset-hidden-items"
            (click)="resetHiddenItems()">
      Show {{ hiddenSidebarItems().length }} hidden item{{ hiddenSidebarItems().length === 1 ? '' : 's' }}
    </button>
  </div>
}
```

- [ ] **Step 7: Build to verify no errors**

```bash
cd frontend && npx ng build --configuration=development 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/features/workspace/
git commit -m "feat: sidebar mini-collapse with initials, per-item hide/reset, Slack-style active indicators"
```

---

### Task 5: Predefined icon picker in profile settings

**Files:**
- Modify: `frontend/src/app/features/profile/profile-settings/profile-settings.ts`
- Modify: `frontend/src/app/features/profile/profile-settings/profile-settings.html`

- [ ] **Step 1: Add `PREDEFINED_ICONS` and `selectIcon()` to `profile-settings.ts`**

After the existing imports, add:

```ts
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
```

Add `AvatarComponent` to the `imports` array in `@Component`.

After line 41 (`readonly avatarError = signal('');`), add:

```ts
readonly PREDEFINED_ICONS = [
  'person', 'face', 'emoji_emotions', 'psychology',
  'rocket_launch', 'star', 'bolt', 'favorite',
  'pets', 'explore', 'palette', 'headphones',
] as const;

readonly showIconPicker = signal(false);
```

After `onAvatarFileSelected()`, add:

```ts
selectIcon(iconName: string): void {
  if (this.isUploadingAvatar()) return;
  this.avatarError.set('');
  this.isUploadingAvatar.set(true);
  const url = `icon:${iconName}`;
  this.usersApi.patchMe(url)
    .pipe(finalize(() => this.isUploadingAvatar.set(false)))
    .subscribe({
      next: user => {
        this.profile.set(user);
        this.authSession.updateAvatarUrl(url);
        this.revokeObjectAvatarUrl();
        this.displayAvatarUrl.set(url);
        this.showIconPicker.set(false);
      },
      error: () => {
        this.avatarError.set('Failed to set icon. Please try again.');
      },
    });
}
```

Note: `authSession` is already injected. Add `private readonly authSession = inject(AuthSessionService);` if it is not already present (look at the existing constructor — it already has `this.authSession` via `private readonly authSession = inject(AuthSessionService)`). ✓ It is already there.

Also update `updateDisplayAvatar()` to handle `icon:` scheme — it must NOT call `getFileBlob` for `icon:` URLs. Replace:

```ts
private updateDisplayAvatar(avatarUrl: string | null): void {
  const attachmentId = this.getAttachmentId(avatarUrl);
  if (!attachmentId) {
    this.revokeObjectAvatarUrl();
    this.displayAvatarUrl.set(avatarUrl || 'default-avatar.png');
    return;
  }

  this.filesApi.getFileBlob(attachmentId).subscribe({
    next: blob => this.setObjectAvatarUrl(URL.createObjectURL(blob)),
    error: () => this.displayAvatarUrl.set('default-avatar.png'),
  });
}
```

With:

```ts
private updateDisplayAvatar(avatarUrl: string | null): void {
  if (avatarUrl?.startsWith('icon:')) {
    this.revokeObjectAvatarUrl();
    this.displayAvatarUrl.set(avatarUrl);
    return;
  }
  const attachmentId = this.getAttachmentId(avatarUrl);
  if (!attachmentId) {
    this.revokeObjectAvatarUrl();
    this.displayAvatarUrl.set(avatarUrl || 'default-avatar.png');
    return;
  }
  this.filesApi.getFileBlob(attachmentId).subscribe({
    next: blob => this.setObjectAvatarUrl(URL.createObjectURL(blob)),
    error: () => this.displayAvatarUrl.set('default-avatar.png'),
  });
}
```

- [ ] **Step 2: Update the profile avatar display to use AvatarComponent**

In `profile-settings.html`, the large `<img data-testid="profile-avatar">` inside the `w-32 h-32` circle is already handled via `displayAvatarUrl()`. The `displayAvatarUrl` signal now stores `icon:*` strings. The existing `<img [src]="displayAvatarUrl()">` would fail for `icon:` scheme. Replace the `<div class="w-32 h-32 rounded-full ...">` block:

Replace:
```html
<div class="w-32 h-32 rounded-full ring-4 ring-surface-container-high overflow-hidden">
  <img
    data-testid="profile-avatar"
    [src]="displayAvatarUrl()"
    alt="Current Avatar"
    class="w-full h-full object-cover"
  />
</div>
```

With:
```html
<div class="w-32 h-32 rounded-full ring-4 ring-surface-container-high overflow-hidden" data-testid="profile-avatar">
  <app-avatar
    [avatarUrl]="profile()?.avatarUrl ?? null"
    [username]="profile()?.username ?? '?'"
    [sizePx]="128"
  />
</div>
```

- [ ] **Step 3: Add icon picker button + grid to `profile-settings.html`**

Below the camera button (`<button ... data-testid="avatar-upload-btn" ...>`), add:

```html
<button
  class="absolute bottom-1 left-1 bg-surface-container text-on-surface-variant p-2 rounded-full shadow-lg hover:bg-surface-container-high transition-colors disabled:opacity-50"
  data-testid="avatar-icon-picker-btn"
  type="button"
  [disabled]="isUploadingAvatar()"
  title="Choose icon"
  (click)="showIconPicker.update(v => !v)"
>
  <span class="material-symbols-outlined text-sm">palette</span>
</button>
```

After the `@if (avatarError())` block and before the text info `<div class="text-center">`, add the icon picker panel:

```html
@if (showIconPicker()) {
  <div class="w-full bg-surface-container-lowest rounded-xl p-4 shadow-md" data-testid="icon-picker">
    <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Choose an icon</p>
    <div class="grid grid-cols-6 gap-2">
      @for (icon of PREDEFINED_ICONS; track icon) {
        <button
          type="button"
          class="w-10 h-10 rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform disabled:opacity-50"
          style="background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dim, #6d28d9))"
          [attr.data-testid]="'icon-option-' + icon"
          [title]="icon"
          [disabled]="isUploadingAvatar()"
          (click)="selectIcon(icon)"
        >
          <span class="material-symbols-outlined text-[18px]">{{ icon }}</span>
        </button>
      }
    </div>
    <button type="button"
            class="mt-3 text-[10px] text-on-surface-variant hover:text-error transition-colors"
            data-testid="icon-picker-close"
            (click)="showIconPicker.set(false)">Close</button>
  </div>
}
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
cd frontend && npx ng build --configuration=development 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/profile/profile-settings/
git commit -m "feat: predefined icon picker in profile settings; handle icon: scheme in avatar display"
```

---

### Task 6: E2E tests

**Files:**
- Create: `e2e/tests/12-avatar-icons.spec.ts`

- [ ] **Step 1: Write the e2e spec**

```ts
// e2e/tests/12-avatar-icons.spec.ts
import { test, expect } from '../fixtures/test-fixtures';
import { createHubConnection } from '../helpers/signalr.helpers';

test.describe('Avatar icons & sidebar hide', () => {
  test('user can select a predefined icon and it appears as navbar avatar', async ({
    userA,
    userAPage,
    api,
  }) => {
    await userAPage.goto('/app/settings');
    await expect(userAPage.locator('[data-testid="avatar-icon-picker-btn"]')).toBeVisible({ timeout: 5_000 });
    await userAPage.click('[data-testid="avatar-icon-picker-btn"]');

    await expect(userAPage.locator('[data-testid="icon-picker"]')).toBeVisible({ timeout: 3_000 });
    await userAPage.click('[data-testid="icon-option-star"]');

    // Picker closes after selection
    await expect(userAPage.locator('[data-testid="icon-picker"]')).toBeHidden({ timeout: 5_000 });

    // Navigate away and back so navbar re-reads fresh session
    await userAPage.goto('/app/rooms');
    await expect(userAPage.locator('[data-testid="navbar-avatar"]')).toBeVisible({ timeout: 5_000 });
    // The avatar should render a Material Symbol span (icon mode), not an img with broken src
    const avatarEl = userAPage.locator('[data-testid="navbar-avatar"] [data-testid="avatar-icon"]');
    await expect(avatarEl).toBeVisible({ timeout: 5_000 });
    await expect(avatarEl).toHaveText('star');
  });

  test('icon selection persists to the backend', async ({ userA, api }) => {
    const ctx = await api.authContext(userA.accessToken);
    const res = await ctx.patch('/api/users/me', { data: { avatarUrl: 'icon:rocket_launch' } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.avatarUrl).toBe('icon:rocket_launch');
    await ctx.dispose();
  });

  test('hiding a room removes it from the sidebar', async ({
    userA,
    userAPage,
    api,
  }) => {
    const room = await api.createRoom(userA.accessToken, { name: `hide-test-${Date.now()}`, visibility: 'Public' });
    await api.joinRoom(userA.accessToken, room.id);

    await userAPage.goto('/app/rooms');
    // Expand public rooms section and find the room
    await expect(userAPage.locator(`[data-testid="public-room-${room.id}"]`)).toBeVisible({ timeout: 8_000 });

    // Hover the room item to reveal the hide button
    await userAPage.hover(`[data-testid="public-room-${room.id}"]`);
    await expect(userAPage.locator(`[data-testid="hide-room-${room.id}"]`)).toBeVisible({ timeout: 2_000 });
    await userAPage.click(`[data-testid="hide-room-${room.id}"]`);

    // Room disappears from the sidebar
    await expect(userAPage.locator(`[data-testid="public-room-${room.id}"]`)).toBeHidden({ timeout: 3_000 });

    // "Show N hidden" button appears
    await expect(userAPage.locator('[data-testid="reset-hidden-items"]')).toBeVisible({ timeout: 2_000 });

    // Click it to restore
    await userAPage.click('[data-testid="reset-hidden-items"]');
    await expect(userAPage.locator(`[data-testid="public-room-${room.id}"]`)).toBeVisible({ timeout: 3_000 });
  });
});
```

- [ ] **Step 2: Run to verify tests fail (expected — app not yet running)**

```bash
cd e2e && npx tsc --noEmit 2>&1 | head -20
```

Expected: no TypeScript compilation errors

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/12-avatar-icons.spec.ts
git commit -m "test(e2e): icon picker persists + sidebar hide/restore"
```

---

### Task 7: UAT tests

**Files:**
- Create: `e2e/tests/uat/10-sidebar-profile.uat.spec.ts`

- [ ] **Step 1: Write UAT spec**

```ts
// e2e/tests/uat/10-sidebar-profile.uat.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';

test.describe('UAT: Sidebar hide and icon avatar', () => {
  test('user sees initials in collapsed sidebar for rooms', async ({
    userA,
    userAPage,
    api,
  }) => {
    const room = await api.createRoom(userA.accessToken, { name: `uat-room-${Date.now()}`, visibility: 'Public' });
    await api.joinRoom(userA.accessToken, room.id);

    await userAPage.goto('/app/rooms');
    await expect(userAPage.locator('[data-testid="sidebar-toggle"]')).toBeVisible({ timeout: 5_000 });

    // Collapse sidebar
    await userAPage.click('[data-testid="sidebar-toggle"]');
    await expect(userAPage.locator('[data-testid="sidebar-collapsed"]')).toBeVisible({ timeout: 3_000 });

    // Room appears as initials circle in collapsed sidebar
    const roomItem = userAPage.locator(`[data-testid="public-room-${room.id}"]`);
    await expect(roomItem).toBeVisible({ timeout: 5_000 });
    // The item should NOT contain a generic material-symbol "public" icon — it should show avatar-initials
    const initialsEl = roomItem.locator('[data-testid="avatar-initials"]');
    await expect(initialsEl).toBeVisible({ timeout: 3_000 });
  });

  test('user can hide a contact from the sidebar and restore via reset', async ({
    userA,
    userB,
    userAPage,
    api,
  }) => {
    // Become friends so userB appears in sidebar contacts
    const { becomeFriends } = await import('../../helpers/friends.helpers');
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);

    await userAPage.goto('/app/rooms');
    await expect(userAPage.locator(`[data-testid="contact-${userB.username}"]`)).toBeVisible({ timeout: 8_000 });

    // Hover to reveal hide button
    await userAPage.hover(`[data-testid="contact-${userB.username}"]`);
    await expect(userAPage.locator(`[data-testid="hide-contact-${userB.username}"]`)).toBeVisible({ timeout: 2_000 });
    await userAPage.click(`[data-testid="hide-contact-${userB.username}"]`);

    await expect(userAPage.locator(`[data-testid="contact-${userB.username}"]`)).toBeHidden({ timeout: 3_000 });

    // Reset button restores them
    await userAPage.click('[data-testid="reset-hidden-items"]');
    await expect(userAPage.locator(`[data-testid="contact-${userB.username}"]`)).toBeVisible({ timeout: 3_000 });
  });

  test('user selects icon avatar in profile settings, it updates the navbar immediately', async ({
    userA,
    userAPage,
  }) => {
    await userAPage.goto('/app/settings');

    // Open the icon picker
    await expect(userAPage.locator('[data-testid="avatar-icon-picker-btn"]')).toBeVisible({ timeout: 5_000 });
    await userAPage.click('[data-testid="avatar-icon-picker-btn"]');
    await expect(userAPage.locator('[data-testid="icon-picker"]')).toBeVisible({ timeout: 3_000 });

    // Select "favorite"
    await userAPage.click('[data-testid="icon-option-favorite"]');

    // Picker closes
    await expect(userAPage.locator('[data-testid="icon-picker"]')).toBeHidden({ timeout: 5_000 });

    // Profile avatar shows the icon
    await expect(userAPage.locator('[data-testid="profile-avatar"] [data-testid="avatar-icon"]'))
      .toHaveText('favorite', { timeout: 5_000 });

    // Navigate to a room page — navbar avatar should still show icon (not broken img)
    await userAPage.goto('/app/rooms');
    await expect(userAPage.locator('[data-testid="navbar-avatar"] [data-testid="avatar-icon"]'))
      .toHaveText('favorite', { timeout: 5_000 });
  });
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd e2e && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/uat/10-sidebar-profile.uat.spec.ts
git commit -m "test(uat): sidebar initials, hide/restore, icon picker UAT coverage"
```

---

### Task 8: Add `createRoom` and `joinRoom` to E2E API helpers (prerequisite for Task 6 test 3)

**Files:**
- Modify: `e2e/helpers/api.helpers.ts`

- [ ] **Step 1: Check if `createRoom` and `joinRoom` exist in `e2e/helpers/api.helpers.ts`**

```bash
grep -n "createRoom\|joinRoom" /Users/igorvaskonyan/projects/ai/ai-chat-herder/e2e/helpers/api.helpers.ts
```

If both are found, skip to Task 9. If missing, continue:

- [ ] **Step 2: Read the existing api.helpers.ts to find the correct addition point**

```bash
cat e2e/helpers/api.helpers.ts
```

- [ ] **Step 3: Add missing methods**

Find the last method in the class and add after it:

```ts
async createRoom(accessToken: string, body: { name: string; description?: string | null; visibility: 'Public' | 'Private' }): Promise<{ id: string; name: string; visibility: string }> {
  const ctx = await this.authContext(accessToken);
  const res = await ctx.post('/api/rooms', { data: body });
  if (res.status() !== 201) throw new Error(`createRoom failed: ${res.status()} ${await res.text()}`);
  const room = await res.json();
  await ctx.dispose();
  return room;
}

async joinRoom(accessToken: string, roomId: string): Promise<void> {
  const ctx = await this.authContext(accessToken);
  const res = await ctx.post(`/api/rooms/${roomId}/join`);
  if (res.status() !== 200 && res.status() !== 204) throw new Error(`joinRoom failed: ${res.status()} ${await res.text()}`);
  await ctx.dispose();
}
```

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/api.helpers.ts
git commit -m "test(e2e): add createRoom and joinRoom to API helpers"
```

---

### Task 9: Add hide-contact data-testid and wire contacts list to `visibleFriends()`

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.html`

- [ ] **Step 1: Add hide button to expanded contacts**

In the expanded contacts `@for (friend of friends(); ...)` section (around line 219), change `friends()` to `visibleFriends()` and wrap each contact in a `group relative` div with hide button:

```html
@if (!sidebarCollapsed()) {
  <div class="flex items-center justify-between p-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg">
    <div class="flex items-center gap-3">
      <span class="material-symbols-outlined">person</span>
      <span class="text-on-surface font-bold text-sm">Contacts</span>
    </div>
    <span class="material-symbols-outlined text-sm">keyboard_arrow_down</span>
  </div>
  <div class="pl-9 space-y-1" data-testid="sidebar-contacts">
    @for (friend of visibleFriends(); track friend.userId) {
      <div class="group relative flex items-center">
        <a [routerLink]="['/app/messages', friend.userId]"
           class="flex flex-1 items-center gap-2 p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm rounded-lg"
           [attr.data-testid]="'contact-' + friend.username">
          <div class="relative shrink-0">
            <app-avatar [avatarUrl]="friend.avatarUrl ?? null" [username]="friend.username" [sizePx]="24" />
            <span class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-surface-container"
                  [class.bg-status-online]="(presenceMap().get(friend.userId) ?? 'offline') === 'online'"
                  [class.bg-status-afk]="(presenceMap().get(friend.userId) ?? 'offline') === 'afk'"
                  [class.bg-outline]="(presenceMap().get(friend.userId) ?? 'offline') === 'offline'">
            </span>
          </div>
          <span class="truncate">{{ friend.username }}</span>
        </a>
        <button type="button"
                class="hidden group-hover:flex ml-1 w-5 h-5 items-center justify-center rounded text-on-surface-variant hover:text-error hover:bg-surface-container-high shrink-0"
                [title]="'Hide ' + friend.username"
                [attr.data-testid]="'hide-contact-' + friend.username"
                (click)="toggleHideItem('contact:' + friend.userId)">
          <span class="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>
    } @empty {
      <div class="p-2 text-on-surface-variant text-sm italic">No contacts yet</div>
    }
  </div>
}
```

Also update the collapsed contacts section to use `visibleFriends()`:
```html
@if (sidebarCollapsed()) {
  <div class="flex flex-col items-center gap-1 py-1" data-testid="sidebar-contacts">
    @for (friend of visibleFriends(); track friend.userId) {
      <!-- existing collapsed contact markup unchanged, just iterable changed -->
```

- [ ] **Step 2: Final build check**

```bash
cd frontend && npx ng build --configuration=development 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/workspace/workspace-shell.component.html
git commit -m "feat: wire visibleFriends and hide button for contacts in sidebar"
```

---

### Task 10: Update DEVELOPMENT_LOG.md

**Files:**
- Modify: `DEVELOPMENT_LOG.md`

- [ ] **Step 1: Prepend T205 entry**

Insert after the `---` separator on line 6 (below the format line):

```markdown
`[2026-04-20 T205]` | **Sidebar redesign + navbar avatar fix + predefined icon picker** | Sidebar collapsed state showed generic icons; navbar used broken `<img src>` for auth-gated `/api/files/{id}` URLs; no avatar icon picker existed | Added shared `AvatarComponent` (auth-aware blob fetch, `icon:*` scheme, initials fallback); fixed navbar avatar; widened mini-sidebar to `w-16` with colored initials circles for rooms; added per-item sidebar hide (`hiddenSidebarItems` signal + localStorage); added 12-icon picker in profile settings storing `icon:<name>` via existing `PATCH /api/users/me`; added `data-testid` contracts for all new elements; 5 Angular unit tests (AvatarComponent) + 5 workspace-shell unit tests + 3 e2e tests + 3 UAT tests
```

- [ ] **Step 2: Commit**

```bash
git add DEVELOPMENT_LOG.md
git commit -m "docs: log T205 sidebar redesign, navbar avatar fix, icon picker"
```

---

## Self-Review

### 1. Spec coverage

| Requirement | Task |
|-------------|------|
| Sidebar partial collapse (not fully hidden) with initials | Task 3 + 4 |
| Users can hide rooms/contacts from sidebar | Task 4 |
| Sidebar Slack-inspired style (active indicator, initials) | Task 3 + 4 |
| Navbar avatar fix (link/auth issue) | Task 2 |
| Predefined vector icon picker in profile settings | Task 5 |
| Unit tests | Task 1 + 4 |
| E2E tests | Task 6 + 7 |
| UAT tests | Task 7 |

All requirements covered. ✓

### 2. Placeholder scan

No TBD, TODO, or "handle edge cases" placeholders. Every step has actual code. ✓

### 3. Type consistency

- `visiblePublicRooms`, `visiblePrivateRooms`, `visibleFriends` — defined in Task 4, used in Task 3 template (Task 3 step 4–5 references them). The template must be committed after the TS changes — enforced by build check in each task. ✓
- `AvatarComponent` — `sizePx: number`, not `size: 'sm'|'md'|'lg'` string. All usages in Tasks 2, 3, 5, and 9 pass `[sizePx]="N"` number. ✓
- `toggleHideItem(key: string)` — called in Tasks 4 and 9 with `'room:' + room.id` and `'contact:' + friend.userId`. ✓
- `authSession.updateAvatarUrl(url)` — defined in Task 2, called in Task 5. ✓
