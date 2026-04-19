# UI Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 10 design audit issues found in T185: header color, missing nav links, contacts presence in sidebar, register confirm password, manage room button, No-Line Rule violations, mobile sidebar collapse, register tab font, Public/Private room accordion, and button roundness.

**Architecture:** All changes are frontend-only (Angular 21 + Tailwind v4 + SCSS). No backend changes. Tests use Vitest + Angular TestBed following existing spec patterns. TDD applies to behavioral changes (Tasks 3, 4, 5, 9); visual-only changes are tested for element existence.

**Tech Stack:** Angular 21 Signals, Tailwind v4 with CSS-variable token bridge (`tailwind.css`), Vitest, SCSS (ViewEncapsulation.Emulated).

---

## File Map

| Task | Create | Modify |
|------|--------|--------|
| 1 | — | `workspace-shell.component.html` |
| 2 | `features/rooms/private-rooms-home/private-rooms-home.ts`, `.html` | `app.routes.ts`, `workspace-shell.component.html` |
| 3 | — | `workspace-shell.component.ts`, `.html`, `.spec.ts` |
| 4 | — | `authentication-page.component.ts`, `.html`, `.spec.ts` |
| 5 | — | `room-chat.html`, `room-chat.ts` |
| 6 | — | `contacts-home.html`, `rooms-home.component.html`, `room-chat.html` |
| 7 | — | `workspace-shell.component.ts`, `.html`, `.scss` |
| 8 | — | `authentication-page.component.html`, scattered `<button rounded-lg>` |
| 9 | — | `workspace-shell.component.ts`, `.html`, `.spec.ts` |

All paths below are relative to `frontend/src/app/`.

---

## Task 1: Fix header background color

**Files:**
- Modify: `features/workspace/workspace-shell.component.html:2`

The header uses `bg-inverse-surface` (#0b0f10, near-black). The design mockup (`designs/main-chat-interface.html:95`) uses `bg-slate-700` (~#334155), which is closest to the design-token `--color-primary` (#545f73). Text switches from `text-inverse-on-surface` (#9a9d9f grey) to `text-on-primary` (#f6f7ff off-white).

- [ ] **Step 1: Apply the fix**

In `features/workspace/workspace-shell.component.html`, replace the `<header>` opening tag:

**Old:**
```html
<header class="bg-inverse-surface text-inverse-on-surface flex items-center justify-between px-6 h-16 w-full shrink-0 z-50 shadow-sm">
```

**New:**
```html
<header class="flex items-center justify-between px-6 h-16 w-full shrink-0 z-50 shadow-sm text-on-primary"
        style="background: linear-gradient(180deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)">
```

Also update the avatar border from `border-outline-variant` to `border-on-primary/30`:

**Old (line ~23):**
```html
class="h-8 w-8 rounded-full border border-outline-variant object-cover"
```
**New:**
```html
class="h-8 w-8 rounded-full border border-on-primary/30 object-cover"
```

- [ ] **Step 2: Verify in browser**

Start the frontend dev server (`cd frontend && npm start`) and open `http://localhost:4200/app`. Confirm the header is a medium slate-gray gradient instead of near-black.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/workspace/workspace-shell.component.html
git commit -m "fix(ui): use primary gradient for workspace header instead of inverse-surface"
```

---

## Task 2: Add Private Rooms nav link and page

**Files:**
- Create: `features/rooms/private-rooms-home/private-rooms-home.ts`
- Create: `features/rooms/private-rooms-home/private-rooms-home.html`
- Modify: `app.routes.ts`
- Modify: `features/workspace/workspace-shell.component.html`

- [ ] **Step 1: Create the component**

`features/rooms/private-rooms-home/private-rooms-home.ts`:
```typescript
import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import type { RoomDto } from '../../../core/rooms/rooms.models';

@Component({
  selector: 'app-private-rooms-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './private-rooms-home.html',
})
export class PrivateRoomsHomeComponent implements OnInit {
  private readonly roomsApi = inject(RoomsApiService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly privateRooms = signal<RoomDto[]>([]);

  ngOnInit(): void {
    this.roomsApi.getMyRooms().subscribe({
      next: rooms => {
        this.privateRooms.set(rooms.filter(r => r.visibility === 'Private'));
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Unable to load private rooms.');
        this.isLoading.set(false);
      },
    });
  }
}
```

- [ ] **Step 2: Create the template**

`features/rooms/private-rooms-home/private-rooms-home.html`:
```html
<section class="flex-1 overflow-y-auto p-8 bg-surface" data-testid="private-rooms-home">
  <div class="max-w-7xl mx-auto">
    <div class="mb-10">
      <h1 class="text-3xl font-extrabold tracking-tight text-on-surface mb-2">Private Rooms</h1>
      <p class="text-on-surface-variant max-w-2xl">Your private room memberships — accessible by invitation only.</p>
    </div>

    @if (isLoading()) {
      <div class="flex justify-center py-24">
        <span class="material-symbols-outlined text-4xl text-outline animate-spin">progress_activity</span>
      </div>
    } @else if (errorMessage()) {
      <p class="text-error text-sm bg-error-container/20 rounded-xl px-6 py-4">{{ errorMessage() }}</p>
    } @else if (privateRooms().length === 0) {
      <div class="text-center py-24">
        <span class="material-symbols-outlined text-5xl text-outline mb-4 block">lock</span>
        <p class="text-on-surface-variant">You have no private room memberships. Ask a room owner for an invitation.</p>
      </div>
    } @else {
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        @for (room of privateRooms(); track room.id) {
          <a [routerLink]="['/app/rooms', room.id]"
             class="bg-surface-container-lowest rounded-xl p-6 flex flex-col gap-4 hover:shadow-sm transition-shadow">
            <div class="flex items-start justify-between gap-3">
              <div class="w-10 h-10 bg-surface-container flex items-center justify-center rounded-lg shrink-0">
                <span class="material-symbols-outlined text-on-surface-variant" style="font-size:1.25rem">lock</span>
              </div>
              <span class="text-[10px] font-bold uppercase tracking-widest text-outline bg-surface-container px-2 py-0.5 rounded-full">Private</span>
            </div>
            <div class="flex-1">
              <h3 class="font-bold text-on-surface mb-1">{{ room.name }}</h3>
              @if (room.description) {
                <p class="text-xs text-on-surface-variant line-clamp-2">{{ room.description }}</p>
              }
            </div>
            <div class="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <span class="material-symbols-outlined" style="font-size:1rem">group</span>
              <span>{{ room.memberCount }} members</span>
            </div>
          </a>
        }
      </div>
    }
  </div>
</section>
```

- [ ] **Step 3: Register the route**

In `app.routes.ts`, add the import and route child:

```typescript
// Add import at top:
import { PrivateRoomsHomeComponent } from './features/rooms/private-rooms-home/private-rooms-home';

// Add child route after the 'rooms' route (inside WorkspaceShellComponent children):
{
  path: 'private-rooms',
  component: PrivateRoomsHomeComponent,
},
```

- [ ] **Step 4: Add nav link in workspace shell**

In `features/workspace/workspace-shell.component.html`, add after the "Public Rooms" link (line ~7):

**Old:**
```html
<a routerLink="/app/rooms" routerLinkActive="border-b-2 border-white text-white" [routerLinkActiveOptions]="{exact:true}" class="text-outline hover:text-white transition-colors pb-1" data-testid="go-to-rooms">Public Rooms</a>
<a routerLink="/app/invitations" routerLinkActive="border-b-2 border-white text-white" class="text-outline hover:text-white transition-colors pb-1">Invitations</a>
```

**New:**
```html
<a routerLink="/app/rooms" routerLinkActive="border-b-2 border-white text-white" [routerLinkActiveOptions]="{exact:true}" class="text-outline hover:text-white transition-colors pb-1" data-testid="go-to-rooms">Public Rooms</a>
<a routerLink="/app/private-rooms" routerLinkActive="border-b-2 border-white text-white" class="text-outline hover:text-white transition-colors pb-1" data-testid="go-to-private-rooms">Private Rooms</a>
<a routerLink="/app/invitations" routerLinkActive="border-b-2 border-white text-white" class="text-outline hover:text-white transition-colors pb-1">Invitations</a>
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm test -- --run
```
Expected: all existing tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/rooms/private-rooms-home/ \
        frontend/src/app/app.routes.ts \
        frontend/src/app/features/workspace/workspace-shell.component.html
git commit -m "feat(ui): add Private Rooms nav link and page (T185 audit fix #2)"
```

---

## Task 3: Show contacts with presence dots in sidebar

**Files:**
- Modify: `features/workspace/workspace-shell.component.ts`
- Modify: `features/workspace/workspace-shell.component.html`
- Modify: `features/workspace/workspace-shell.component.spec.ts`

- [ ] **Step 1: Write the failing test first (RED)**

Add to `features/workspace/workspace-shell.component.spec.ts`. The `buildProviders` function needs a `FriendsApiService` stub. Extend it:

```typescript
// Add import at top of spec file:
import { FriendsApiService } from '../../core/friends/friends-api.service';

// In buildProviders() providers array, add:
{
  provide: FriendsApiService,
  useValue: { getFriends: vi.fn().mockReturnValue(of([])) },
},
```

Then add the test:
```typescript
it('renders contacts section in sidebar when friends are loaded', async () => {
  const friends = [
    { friendshipId: 'f1', userId: 'u10', username: 'alice', avatarUrl: null, friendSince: '' },
    { friendshipId: 'f2', userId: 'u11', username: 'bob', avatarUrl: null, friendSince: '' },
  ];
  const { providers } = buildProviders();
  const friendsStub = { getFriends: vi.fn().mockReturnValue(of(friends)) };
  const providersWithFriends = providers.map(p =>
    'provide' in p && p.provide === FriendsApiService
      ? { provide: FriendsApiService, useValue: friendsStub }
      : p,
  );
  TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers: providersWithFriends });
  const fixture = TestBed.createComponent(WorkspaceShellComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const compiled: Element = fixture.nativeElement;
  expect(compiled.querySelector('[data-testid="sidebar-contacts"]')).not.toBeNull();
  expect(compiled.querySelector('[data-testid="contact-alice"]')).not.toBeNull();
  expect(compiled.querySelector('[data-testid="contact-bob"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run test — confirm RED**

```bash
cd frontend && npm test -- --run workspace-shell
```
Expected: FAIL — `sidebar-contacts` not found.

- [ ] **Step 3: Add friends signal to workspace-shell TS**

In `features/workspace/workspace-shell.component.ts`:

Add import:
```typescript
import { FriendsApiService } from '../../core/friends/friends-api.service';
import type { FriendDto } from '../../core/friends/friends.models';
```

Add injection and signal:
```typescript
private readonly friendsApi = inject(FriendsApiService);
readonly friends = signal<FriendDto[]>([]);
```

In `bootstrapData()`, add:
```typescript
this.friendsApi.getFriends().subscribe({
  next: friends => this.friends.set(friends),
});
```

- [ ] **Step 4: Render contacts in sidebar HTML**

In `features/workspace/workspace-shell.component.html`, replace the Contacts section (the `<div class="mt-4 space-y-1">` block containing just a heading, lines ~72–79) with:

```html
<div class="mt-4 space-y-1">
  <div class="flex items-center justify-between p-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg">
    <div class="flex items-center gap-3">
      <span class="material-symbols-outlined">person</span>
      <span class="text-on-surface font-bold">Contacts</span>
    </div>
    <span class="material-symbols-outlined text-sm">keyboard_arrow_down</span>
  </div>
  <div class="pl-9 space-y-1" data-testid="sidebar-contacts">
    @for (friend of friends(); track friend.userId) {
      <a [routerLink]="['/app/messages', friend.userId]"
         class="flex items-center gap-2 p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm rounded-lg"
         [attr.data-testid]="'contact-' + friend.username">
        <div class="relative shrink-0">
          @if (friend.avatarUrl) {
            <img [src]="friend.avatarUrl" [alt]="friend.username" class="w-6 h-6 rounded-full object-cover" />
          } @else {
            <div class="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center">
              <span class="text-[8px] font-bold text-on-surface-variant">{{ friend.username[0].toUpperCase() }}</span>
            </div>
          }
          <span class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-surface-container"
                [class.bg-status-online]="(presenceMap().get(friend.userId) ?? 'offline') === 'online'"
                [class.bg-status-afk]="(presenceMap().get(friend.userId) ?? 'offline') === 'afk'"
                [class.bg-outline]="(presenceMap().get(friend.userId) ?? 'offline') === 'offline'">
          </span>
        </div>
        <span class="truncate">{{ friend.username }}</span>
      </a>
    } @empty {
      <div class="p-2 text-on-surface-variant text-sm italic">No contacts yet</div>
    }
  </div>
</div>
```

- [ ] **Step 5: Run tests — confirm GREEN**

```bash
cd frontend && npm test -- --run workspace-shell
```
Expected: all workspace-shell tests pass including the new contacts test.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/workspace/workspace-shell.component.ts \
        frontend/src/app/features/workspace/workspace-shell.component.html \
        frontend/src/app/features/workspace/workspace-shell.component.spec.ts
git commit -m "feat(ui): show contacts with presence dots in workspace sidebar (T185 audit fix #3)"
```

---

## Task 4: Register form — add Confirm Password field

**Files:**
- Modify: `features/auth/authentication-page.component.ts`
- Modify: `features/auth/authentication-page.component.html`
- Modify: `features/auth/authentication-page.component.spec.ts`

- [ ] **Step 1: Write failing test (RED)**

Add to `features/auth/authentication-page.component.spec.ts`:

```typescript
it('renders confirm-password field in register mode', () => {
  const fixture = TestBed.createComponent(AuthenticationPageComponent);
  fixture.detectChanges();
  fixture.componentInstance.setMode('register');
  fixture.detectChanges();
  const compiled = fixture.nativeElement;
  expect(compiled.querySelector('[data-testid="register-confirm-password"]')).not.toBeNull();
});

it('register form is invalid when passwords do not match', () => {
  const fixture = TestBed.createComponent(AuthenticationPageComponent);
  fixture.detectChanges();
  const comp = fixture.componentInstance;
  comp.setMode('register');
  fixture.detectChanges();
  comp.registerForm.setValue({
    username: 'alice',
    email: 'a@a.com',
    password: 'password1',
    confirmPassword: 'password2',
    keepSignedIn: true,
  });
  expect(comp.registerForm.hasError('passwordMismatch')).toBe(true);
});

it('register form is valid when passwords match', () => {
  const fixture = TestBed.createComponent(AuthenticationPageComponent);
  fixture.detectChanges();
  const comp = fixture.componentInstance;
  comp.setMode('register');
  fixture.detectChanges();
  comp.registerForm.setValue({
    username: 'alice',
    email: 'a@a.com',
    password: 'password1',
    confirmPassword: 'password1',
    keepSignedIn: true,
  });
  expect(comp.registerForm.hasError('passwordMismatch')).toBe(false);
  expect(comp.registerForm.valid).toBe(true);
});
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
cd frontend && npm test -- --run authentication-page
```
Expected: FAIL — `register-confirm-password` not found, `passwordMismatch` error not set.

- [ ] **Step 3: Add `confirmPassword` control and validator to TS**

In `features/auth/authentication-page.component.ts`:

Add the cross-field validator function before the class definition:
```typescript
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

function passwordMatchValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get('password')?.value as string;
    const confirm = group.get('confirmPassword')?.value as string;
    return password && confirm && password !== confirm ? { passwordMismatch: true } : null;
  };
}
```

Update the `registerForm` declaration:
```typescript
readonly registerForm = this.formBuilder.group(
  {
    username: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(32)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
    keepSignedIn: [true],
  },
  { validators: passwordMatchValidator() },
);
```

Update `registerFieldHasError` to accept `'confirmPassword'`:
```typescript
registerFieldHasError(controlName: 'username' | 'email' | 'password' | 'confirmPassword'): boolean {
  const control = this.registerForm.controls[controlName];
  return control.invalid && (control.dirty || control.touched);
}
```

Update `submitRegister` to destructure `confirmPassword` out before sending to API:
```typescript
submitRegister(): void {
  if (this.registerForm.invalid || this.isSubmitting()) {
    this.registerForm.markAllAsTouched();
    return;
  }
  this.errorMessage.set('');
  this.isSubmitting.set(true);
  const { confirmPassword: _unused, ...payload } = this.registerForm.getRawValue();
  this.authApi
    .register(payload)
    .pipe(finalize(() => this.isSubmitting.set(false)))
    .subscribe({
      next: (response) => this.completeAuthentication(response),
      error: (error: { error?: { error?: string } }) => {
        this.errorMessage.set(error.error?.error ?? 'Unable to create an account right now.');
      },
    });
}
```

- [ ] **Step 4: Add the field to the template**

In `features/auth/authentication-page.component.html`, in the Register form, replace the `grid grid-cols-2` block (which had Password + Keep signed in checkbox, lines ~215–239) with a vertical stack:

```html
<div class="space-y-1">
  <label class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Password</label>
  <input
    pInputText
    [invalid]="registerFieldHasError('password')"
    data-testid="register-password"
    class="w-full px-4 py-3 bg-surface-container-low border-none focus:ring-0 rounded-md text-sm border-b-2 border-transparent focus:border-primary"
    type="password"
    formControlName="password"
    placeholder="••••••••"
  />
  @if (registerFieldHasError('password')) {
    <span class="text-xs text-error">Min 8 characters.</span>
  }
</div>
<div class="space-y-1">
  <label class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Confirm Password</label>
  <input
    pInputText
    [invalid]="registerFieldHasError('confirmPassword') || registerForm.hasError('passwordMismatch')"
    data-testid="register-confirm-password"
    class="w-full px-4 py-3 bg-surface-container-low border-none focus:ring-0 rounded-md text-sm border-b-2 border-transparent focus:border-primary"
    type="password"
    formControlName="confirmPassword"
    placeholder="••••••••"
  />
  @if (registerForm.hasError('passwordMismatch') && (registerForm.touched || registerForm.dirty)) {
    <span class="text-xs text-error">Passwords do not match.</span>
  }
</div>
<div class="flex items-center space-x-3">
  <input class="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/20"
         id="register-keep-signed-in" type="checkbox" formControlName="keepSignedIn"/>
  <label class="text-xs text-on-surface-variant font-medium select-none" for="register-keep-signed-in">Keep me signed in</label>
</div>
```

- [ ] **Step 5: Run tests — confirm GREEN**

```bash
cd frontend && npm test -- --run authentication-page
```
Expected: all 5 auth tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/auth/authentication-page.component.ts \
        frontend/src/app/features/auth/authentication-page.component.html \
        frontend/src/app/features/auth/authentication-page.component.spec.ts
git commit -m "feat(ui): add confirm-password field to register form with match validator (T185 audit fix #4)"
```

---

## Task 5: Add "Manage room" button to chat header

**Files:**
- Modify: `features/rooms/room-chat/room-chat.ts`
- Modify: `features/rooms/room-chat/room-chat.html`

- [ ] **Step 1: Write failing test (RED)**

Check if there's a spec file:
```bash
ls frontend/src/app/features/rooms/room-chat/room-chat.spec.ts
```
If missing, create it:

`features/rooms/room-chat/room-chat.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { RoomChatComponent } from './room-chat';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';

function buildRoomChatProviders(callerRole: 'Owner' | 'Admin' | 'Member' | null = 'Owner') {
  const room = { id: 'r1', name: 'test', visibility: 'Public', ownerId: 'u1', description: null, createdAt: '', memberCount: 1, callerRole };
  return [
    provideRouter([]),
    { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'r1' } } } },
    { provide: AuthSessionService, useValue: { user: signal(null).asReadonly() } },
    { provide: RoomsApiService, useValue: { getRoom: vi.fn().mockReturnValue(of(room)), getMessages: vi.fn().mockReturnValue(of([])) } },
    { provide: ChatService, useValue: { connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined), joinRoom: vi.fn().mockResolvedValue(undefined), leaveRoom: vi.fn().mockResolvedValue(undefined), sendMessage: vi.fn().mockResolvedValue(undefined), lastRoomEvent: signal(null).asReadonly() } },
    { provide: PresenceService, useValue: { connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined), joinRoom: vi.fn().mockResolvedValue(undefined), leaveRoom: vi.fn().mockResolvedValue(undefined), presenceMap: signal(new Map()).asReadonly(), roomMembersSnapshot: signal(null).asReadonly(), memberJoined: signal(null).asReadonly(), memberLeft: signal(null).asReadonly(), removedFromRoom: signal(null).asReadonly() } },
    { provide: FilesApiService, useValue: { uploadFile: vi.fn(), downloadFile: vi.fn() } },
    { provide: NotificationsApiService, useValue: { markRoomRead: vi.fn().mockReturnValue(of(null)) } },
    UnreadService,
  ];
}

describe('RoomChatComponent', () => {
  it('shows manage room link when callerRole is Owner', async () => {
    TestBed.configureTestingModule({ imports: [RoomChatComponent], providers: buildRoomChatProviders('Owner') });
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="manage-room-link"]')).not.toBeNull();
  });

  it('shows manage room link when callerRole is Admin', async () => {
    TestBed.configureTestingModule({ imports: [RoomChatComponent], providers: buildRoomChatProviders('Admin') });
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="manage-room-link"]')).not.toBeNull();
  });

  it('hides manage room link when callerRole is Member', async () => {
    TestBed.configureTestingModule({ imports: [RoomChatComponent], providers: buildRoomChatProviders('Member') });
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="manage-room-link"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — confirm RED**

```bash
cd frontend && npm test -- --run room-chat
```
Expected: FAIL — `manage-room-link` not found.

- [ ] **Step 3: Add RouterLink import to room-chat.ts**

In `features/rooms/room-chat/room-chat.ts`, add `RouterLink` to imports:

```typescript
import { RouterLink } from '@angular/router';
// ...
imports: [Button, Textarea, FormsModule, RouterLink],
```

- [ ] **Step 4: Add the manage room button to the template**

In `features/rooms/room-chat/room-chat.html`, update the chat header actions div (lines ~14–17):

**Old:**
```html
<div class="flex items-center gap-4">
  <span class="text-on-surface-variant text-xs">{{ room()?.memberCount }} members</span>
</div>
```

**New:**
```html
<div class="flex items-center gap-4">
  <span class="text-on-surface-variant text-xs">{{ room()?.memberCount }} members</span>
  @if (room()?.callerRole === 'Owner' || room()?.callerRole === 'Admin') {
    <a [routerLink]="['/app/rooms', room()!.id, 'manage']"
       class="text-primary text-sm font-semibold px-4 py-2 hover:bg-surface-container transition-colors rounded-md"
       data-testid="manage-room-link">Manage room</a>
  }
</div>
```

- [ ] **Step 5: Run tests — confirm GREEN**

```bash
cd frontend && npm test -- --run room-chat
```
Expected: all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/rooms/room-chat/room-chat.ts \
        frontend/src/app/features/rooms/room-chat/room-chat.html \
        frontend/src/app/features/rooms/room-chat/room-chat.spec.ts
git commit -m "feat(ui): add Manage room button to chat header for Owner/Admin (T185 audit fix #5)"
```

---

## Task 6: Remove No-Line Rule border violations

**Files:**
- Modify: `features/contacts/contacts-home/contacts-home.html`
- Modify: `features/rooms/rooms-home.component.html`
- Modify: `features/rooms/room-chat/room-chat.html`

- [ ] **Step 1: Fix contacts-home.html — remove structural border-b divider**

In `features/contacts/contacts-home/contacts-home.html`, find line 156:

**Old:**
```html
<div class="flex items-start gap-3 pb-4 border-b border-surface-container last:border-b-0 last:pb-0">
```
**New:**
```html
<div class="flex items-start gap-3 pb-4">
```

- [ ] **Step 2: Fix rooms-home.component.html — remove structural border-t divider**

In `features/rooms/rooms-home.component.html`, find line 35 (the member-count row inside the room card):

**Old:**
```html
<div class="flex items-center justify-between pt-2 border-t border-outline-variant/10">
```
**New:**
```html
<div class="flex items-center justify-between pt-3">
```

- [ ] **Step 3: Fix room-chat.html — remove structural border-l on members panel**

In `features/rooms/room-chat/room-chat.html`, find line 136:

**Old:**
```html
<aside class="bg-surface-container w-56 shrink-0 h-full overflow-y-auto hidden lg:flex flex-col p-4 border-l border-outline-variant/10">
```
**New:**
```html
<aside class="bg-surface-container w-56 shrink-0 h-full overflow-y-auto hidden lg:flex flex-col p-4">
```

The tonal shift from `bg-surface-container-lowest` (main chat) to `bg-surface-container` (members panel) provides sufficient visual separation without a border line.

- [ ] **Step 4: Run tests to verify no regressions**

```bash
cd frontend && npm test -- --run
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/contacts/contacts-home/contacts-home.html \
        frontend/src/app/features/rooms/rooms-home.component.html \
        frontend/src/app/features/rooms/room-chat/room-chat.html
git commit -m "fix(ui): remove structural border lines per DESIGN.md No-Line Rule (T185 audit fix #6)"
```

---

## Task 7: Mobile sidebar collapse

**Files:**
- Modify: `features/workspace/workspace-shell.component.ts`
- Modify: `features/workspace/workspace-shell.component.html`
- Modify: `features/workspace/workspace-shell.component.scss`

- [ ] **Step 1: Add sidebarOpen signal to workspace-shell.ts**

In `features/workspace/workspace-shell.component.ts`, add the signal:

```typescript
readonly sidebarOpen = signal(false);

toggleSidebar(): void {
  this.sidebarOpen.update(v => !v);
}
```

- [ ] **Step 2: Add SCSS for responsive sidebar**

Replace the content of `features/workspace/workspace-shell.component.scss` with:

```scss
.workspace-sidebar {
  display: none;
  flex-direction: column;

  @media (min-width: 768px) {
    display: flex;
  }

  &--open {
    display: flex;
  }
}
```

- [ ] **Step 3: Update the sidebar element in HTML**

In `features/workspace/workspace-shell.component.html`, change the aside from:

**Old:**
```html
<aside class="bg-surface-container flex flex-col w-72 shrink-0 h-full overflow-y-auto p-4">
```

**New:**
```html
<aside class="workspace-sidebar bg-surface-container w-72 shrink-0 h-full overflow-y-auto p-4"
       [class.workspace-sidebar--open]="sidebarOpen()">
```

- [ ] **Step 4: Add hamburger button in the header (mobile only)**

In `features/workspace/workspace-shell.component.html`, inside the header, right before `</header>`, add a hamburger button visible only on mobile:

```html
<button class="md:hidden p-2 text-on-primary hover:bg-on-primary/10 rounded-md transition-colors"
        type="button"
        (click)="toggleSidebar()"
        aria-label="Toggle sidebar">
  <span class="material-symbols-outlined">{{ sidebarOpen() ? 'close' : 'menu' }}</span>
</button>
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm test -- --run workspace-shell
```
Expected: all tests pass (sidebarOpen is a signal — no behavior logic tested; visual-only).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/workspace/workspace-shell.component.ts \
        frontend/src/app/features/workspace/workspace-shell.component.html \
        frontend/src/app/features/workspace/workspace-shell.component.scss
git commit -m "feat(ui): add mobile hamburger toggle for workspace sidebar collapse (T185 audit fix #7)"
```

---

## Task 8: Font consistency and button border-radius

**Files:**
- Modify: `features/auth/authentication-page.component.html`
- Modify: `features/rooms/room-chat/room-chat.html`
- Modify: `features/contacts/contacts-home/contacts-home.html`
- Modify: `features/workspace/workspace-shell.component.html`

**Sub-issue 8a: Register tab `font-medium` → `font-bold`**

- [ ] **Step 1: Fix Register tab button weight**

In `features/auth/authentication-page.component.html`, line ~59:

**Old:**
```html
class="px-6 py-2 text-sm font-medium transition-colors"
```
**New:**
```html
class="px-6 py-2 text-sm font-bold transition-colors"
```

**Sub-issue 8b: Button border-radius `rounded-lg` → `rounded-md` on raw `<button>` elements**

In Tailwind v4 token bridge: `rounded-md` = `--radius-md` = 0.375rem (correct for buttons); `rounded-lg` = 0.25rem (too sharp).

- [ ] **Step 2: Fix auth page buttons**

In `features/auth/authentication-page.component.html`, change `rounded-lg` to `rounded-md` on all `<button>` elements:

Line ~144 (Sign In submit button):
```html
<!-- Old: -->
class="w-full py-4 bg-primary text-on-primary font-bold rounded-lg hover:bg-primary-dim ..."
<!-- New: -->
class="w-full py-4 bg-primary text-on-primary font-bold rounded-md hover:bg-primary-dim ..."
```

Line ~166 (Create Account button in register prompt):
```html
<!-- Old: -->
class="px-5 py-2.5 bg-surface-container-lowest text-primary text-xs font-bold rounded-lg ..."
<!-- New: -->
class="px-5 py-2.5 bg-surface-container-lowest text-primary text-xs font-bold rounded-md ..."
```

Line ~242 (Register submit button):
```html
<!-- Old: -->
class="w-full py-4 bg-primary text-on-primary font-bold rounded-lg ..."
<!-- New: -->
class="w-full py-4 bg-primary text-on-primary font-bold rounded-md ..."
```

- [ ] **Step 3: Fix room-chat.html button radius**

In `features/rooms/room-chat/room-chat.html`, line ~109:
```html
<!-- Old: -->
class="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant shrink-0"
<!-- New: -->
class="p-2 rounded-md hover:bg-surface-container text-on-surface-variant shrink-0"
```

- [ ] **Step 4: Fix contacts-home.html button radius**

In `features/contacts/contacts-home/contacts-home.html`:

Line ~47 (Friends toggle button when active — no `rounded-lg` in its class, skip).
Line ~88–92 (Chat button inside friend card):
```html
<!-- Old: -->
class="flex-1 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg ..."
<!-- New: -->
class="flex-1 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-md ..."
```
Line ~93–97 (Remove button inside friend card):
```html
<!-- Old: -->
class="flex-1 py-1.5 bg-error-container text-on-error-container text-xs font-bold rounded-lg ..."
<!-- New: -->
class="flex-1 py-1.5 bg-error-container text-on-error-container text-xs font-bold rounded-md ..."
```
Line ~229 (Send Request button):
```html
<!-- Old: -->
class="w-full bg-primary text-white text-xs font-bold py-3 rounded-lg ..."
<!-- New: -->
class="w-full bg-primary text-white text-xs font-bold py-3 rounded-md ..."
```

- [ ] **Step 5: Fix workspace-shell buttons in create-room form**

In `features/workspace/workspace-shell.component.html`:

Lines ~98–105 and ~106–113 (Public/Private visibility toggle buttons):
```html
<!-- Old both: class="... rounded-lg ..." -->
<!-- New both: class="... rounded-md ..." -->
```

Line ~120 (Create submit):
```html
<!-- Old: class="flex-1 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg ..." -->
<!-- New: class="flex-1 py-2 bg-primary text-on-primary text-xs font-bold rounded-md ..." -->
```

Line ~126 (Cancel button):
```html
<!-- Old: class="px-4 py-2 text-xs font-bold text-on-surface-variant rounded-lg ..." -->
<!-- New: class="px-4 py-2 text-xs font-bold text-on-surface-variant rounded-md ..." -->
```

- [ ] **Step 6: Run tests**

```bash
cd frontend && npm test -- --run
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/auth/authentication-page.component.html \
        frontend/src/app/features/rooms/room-chat/room-chat.html \
        frontend/src/app/features/contacts/contacts-home/contacts-home.html \
        frontend/src/app/features/workspace/workspace-shell.component.html
git commit -m "fix(ui): register tab font-bold + button radius rounded-md per DESIGN.md (T185 audit fix #8)"
```

---

## Task 9: Public/Private rooms accordion in sidebar

**Files:**
- Modify: `features/workspace/workspace-shell.component.ts`
- Modify: `features/workspace/workspace-shell.component.html`
- Modify: `features/workspace/workspace-shell.component.spec.ts`

- [ ] **Step 1: Write failing test (RED)**

Add to `features/workspace/workspace-shell.component.spec.ts`:

```typescript
it('shows public and private room sections when myRooms has both visibility types', async () => {
  const rooms = [
    { id: 'r1', name: 'general', visibility: 'Public', ownerId: 'u1', description: null, createdAt: '', memberCount: 5, callerRole: 'Member' as const },
    { id: 'r2', name: 'core-team', visibility: 'Private', ownerId: 'u1', description: null, createdAt: '', memberCount: 2, callerRole: 'Owner' as const },
  ];
  const { providers } = buildProviders();
  const roomsApiStub = {
    getMyRooms: vi.fn().mockReturnValue(of(rooms)),
    createRoom: vi.fn(),
  };
  const providersWithRooms = providers.map(p =>
    'provide' in p && p.provide === RoomsApiService
      ? { provide: RoomsApiService, useValue: roomsApiStub }
      : p,
  );
  TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers: providersWithRooms });
  const fixture = TestBed.createComponent(WorkspaceShellComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const compiled: Element = fixture.nativeElement;
  expect(compiled.querySelector('[data-testid="public-rooms-section"]')).not.toBeNull();
  expect(compiled.querySelector('[data-testid="private-rooms-section"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run test — confirm RED**

```bash
cd frontend && npm test -- --run workspace-shell
```
Expected: FAIL — `public-rooms-section` not found.

- [ ] **Step 3: Add computed room groups to workspace-shell.ts**

In `features/workspace/workspace-shell.component.ts`, add after `readonly myRooms`:

```typescript
import { computed } from '@angular/core'; // already imported if not there

readonly publicRooms = computed(() => this.myRooms().filter(r => r.visibility === 'Public'));
readonly privateRooms = computed(() => this.myRooms().filter(r => r.visibility === 'Private'));
readonly publicRoomsExpanded = signal(true);
readonly privateRoomsExpanded = signal(true);
```

- [ ] **Step 4: Update sidebar rooms section in HTML**

In `features/workspace/workspace-shell.component.html`, replace the single Rooms block (the `<div class="space-y-1">` starting at ~line 47) with two accordion sections:

```html
<div class="space-y-1">
  <!-- Public Rooms accordion -->
  <div class="flex items-center justify-between p-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg"
       (click)="publicRoomsExpanded.update(v => !v)">
    <div class="flex items-center gap-3">
      <span class="material-symbols-outlined">forum</span>
      <span class="text-on-surface font-bold text-sm">Public Rooms</span>
    </div>
    <span class="material-symbols-outlined text-sm">{{ publicRoomsExpanded() ? 'keyboard_arrow_down' : 'keyboard_arrow_right' }}</span>
  </div>
  @if (publicRoomsExpanded()) {
    <div class="pl-9 space-y-1" data-testid="public-rooms-section">
      @for (room of publicRooms(); track room.id) {
        <a [routerLink]="['/app/rooms', room.id]"
           routerLinkActive="bg-surface-container-lowest text-on-surface font-bold"
           class="flex items-center justify-between p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm rounded-lg">
          <span class="truncate">#{{ room.name }}</span>
          @let count = getUnreadCount('room', room.id);
          @if (count > 0) {
            <span class="ml-1 shrink-0 min-w-[1.25rem] h-5 px-1 bg-primary text-on-primary text-[10px] font-black rounded-full flex items-center justify-center">{{ count }}</span>
          }
        </a>
      } @empty {
        <div class="p-2 text-on-surface-variant text-sm italic">No public rooms</div>
      }
    </div>
  }

  <!-- Private Rooms accordion -->
  <div class="flex items-center justify-between p-2 mt-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg"
       (click)="privateRoomsExpanded.update(v => !v)">
    <div class="flex items-center gap-3">
      <span class="material-symbols-outlined">lock</span>
      <span class="text-on-surface font-bold text-sm">Private Rooms</span>
    </div>
    <span class="material-symbols-outlined text-sm">{{ privateRoomsExpanded() ? 'keyboard_arrow_down' : 'keyboard_arrow_right' }}</span>
  </div>
  @if (privateRoomsExpanded()) {
    <div class="pl-9 space-y-1" data-testid="private-rooms-section">
      @for (room of privateRooms(); track room.id) {
        <a [routerLink]="['/app/rooms', room.id]"
           routerLinkActive="bg-surface-container-lowest text-on-surface font-bold"
           class="flex items-center justify-between p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm rounded-lg">
          <span class="truncate">#{{ room.name }}</span>
          @let count = getUnreadCount('room', room.id);
          @if (count > 0) {
            <span class="ml-1 shrink-0 min-w-[1.25rem] h-5 px-1 bg-primary text-on-primary text-[10px] font-black rounded-full flex items-center justify-center">{{ count }}</span>
          }
        </a>
      } @empty {
        <div class="p-2 text-on-surface-variant text-sm italic">No private rooms</div>
      }
    </div>
  }
</div>
```

- [ ] **Step 5: Run tests — confirm GREEN**

```bash
cd frontend && npm test -- --run workspace-shell
```
Expected: all workspace-shell tests pass.

- [ ] **Step 6: Run full suite**

```bash
cd frontend && npm test -- --run
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/workspace/workspace-shell.component.ts \
        frontend/src/app/features/workspace/workspace-shell.component.html \
        frontend/src/app/features/workspace/workspace-shell.component.spec.ts
git commit -m "feat(ui): split sidebar rooms into Public/Private accordion sections (T185 audit fix #9)"
```

---

## Final: Log to DEVELOPMENT_LOG.md

- [ ] **Append T186 entry to DEVELOPMENT_LOG.md** using the format defined in AGENT.md §2.

---

## Self-Review Against Audit Findings

| Audit Issue | Task | Covered? |
|-------------|------|---------|
| 1. Header background too dark | Task 1 | ✅ |
| 2. Private Rooms nav missing | Task 2 | ✅ |
| 3. Contacts with presence absent from sidebar | Task 3 | ✅ |
| 4. Register missing Confirm Password | Task 4 | ✅ |
| 5. Manage room button absent | Task 5 | ✅ |
| 6. No-Line Rule border violations | Task 6 | ✅ |
| 7. Left sidebar no mobile collapse | Task 7 | ✅ |
| 8a. Register tab font-medium → font-bold | Task 8 | ✅ |
| 8b. Button `rounded-lg` → `rounded-md` | Task 8 | ✅ |
| 9. Public/Private rooms accordion | Task 9 | ✅ |
| 10. (issue 11 — no action needed) | — | n/a |
