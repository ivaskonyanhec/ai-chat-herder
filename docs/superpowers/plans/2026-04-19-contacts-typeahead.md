# Contacts Page — User Typeahead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-search typeahead dropdown to the "Send New Invitation" username field on the Contacts page, filtering out already-friends and users with pending outgoing requests.

**Architecture:** Pure frontend change. `ContactsHomeComponent` gets `onUsernameInput()` which calls the existing `UsersApiService.searchUsers()` after 2 chars, filters results client-side against loaded friends and outgoing requests, and stores them in a `userSuggestions` signal. A dropdown `<ul>` renders below the input. No new services or API endpoints needed.

**Tech Stack:** Angular 21 Signals, TypeScript, Tailwind CSS, Vitest unit tests.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/app/features/contacts/contacts-home/contacts-home.ts` | Modify | Add `userSuggestions`, `isSearchingUsers` signals; `onUsernameInput`, `selectSuggestion` methods; inject `UsersApiService` |
| `frontend/src/app/features/contacts/contacts-home/contacts-home.html` | Modify | Wrap input in `relative` div; add dropdown `<ul>`; add spinner; bind `(ngModelChange)` to call `onUsernameInput` |
| `frontend/src/app/features/contacts/contacts-home/contacts-home.spec.ts` | Modify | 3 new unit tests |

---

### Task 1: Component logic — signals and methods

**Files:**
- Modify: `frontend/src/app/features/contacts/contacts-home/contacts-home.ts`

- [ ] **Step 1: Add `UsersApiService` import and injection**

At the top of the file, add:
```typescript
import { UsersApiService, UserSearchResult } from '../../../core/users/users-api.service';
```

Inside the class, add the injection after `blocksApi`:
```typescript
private readonly usersApi = inject(UsersApiService);
```

- [ ] **Step 2: Add new signals**

After `readonly sendingRequest = signal(false);`, add:

```typescript
readonly userSuggestions = signal<UserSearchResult[]>([]);
readonly isSearchingUsers = signal(false);
```

- [ ] **Step 3: Add `onUsernameInput` and `selectSuggestion` methods**

After `sendFriendRequest()`, add:

```typescript
onUsernameInput(value: string): void {
  this.newRequestUsername.set(value);
  const query = value.trim();
  if (query.length < 2) {
    this.userSuggestions.set([]);
    return;
  }

  this.isSearchingUsers.set(true);
  this.usersApi.searchUsers(query, 8)
    .pipe(finalize(() => this.isSearchingUsers.set(false)))
    .subscribe({
      next: users => {
        const selfId = this.user()?.id;
        const friendUsernames = new Set(this.friends().map(f => f.username.toLowerCase()));
        const pendingOutgoing = new Set(
          this.outgoingRequests().map(r => r.receiverUsername.toLowerCase())
        );
        this.userSuggestions.set(
          users.filter(u =>
            u.id !== selfId &&
            !friendUsernames.has(u.username.toLowerCase()) &&
            !pendingOutgoing.has(u.username.toLowerCase())
          )
        );
      },
      error: () => this.userSuggestions.set([]),
    });
}

selectSuggestion(user: UserSearchResult): void {
  this.newRequestUsername.set(user.username);
  this.userSuggestions.set([]);
}
```

- [ ] **Step 4: Clear suggestions on submit**

In `sendFriendRequest()`, add `this.userSuggestions.set([]);` inside the `next` callback, after clearing username/message:

```typescript
next: () => {
  this.newRequestUsername.set('');
  this.newRequestMessage.set('');
  this.userSuggestions.set([]);          // ADD THIS
  this.requestStatusMessage.set('Friend request sent.');
},
```

- [ ] **Step 5: Run Angular typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/contacts/contacts-home/contacts-home.ts
git commit -m "feat: contacts page user typeahead logic with friend/pending filtering"
```

---

### Task 2: HTML — dropdown and spinner

**Files:**
- Modify: `frontend/src/app/features/contacts/contacts-home/contacts-home.html`

- [ ] **Step 1: Wrap username input in `relative` container and add spinner + dropdown**

Replace the existing `<div class="space-y-1">` block containing the username input (lines ~202–211) with:

```html
<div class="space-y-1">
  <label class="text-[10px] font-bold text-outline uppercase tracking-wider">Username</label>
  <div class="relative">
    <input
      class="w-full bg-surface-container-lowest border-none rounded p-3 text-xs focus:ring-1 focus:ring-primary/20"
      [ngModel]="newRequestUsername()"
      (ngModelChange)="onUsernameInput($event)"
      name="newRequestUsername"
      placeholder="&#64;handle"
      type="text"
      autocomplete="off"
    />
    @if (isSearchingUsers()) {
      <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline text-sm animate-spin">
        progress_activity
      </span>
    }
    @if (userSuggestions().length > 0) {
      <ul class="absolute left-0 right-0 top-full mt-1 bg-surface-container-lowest rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto border border-outline-variant/10">
        @for (user of userSuggestions(); track user.id) {
          <li class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container cursor-pointer text-sm"
              [attr.data-testid]="'user-suggestion-' + user.username"
              (mousedown)="selectSuggestion(user)">
            <div class="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
              <span class="text-[10px] font-bold text-on-surface-variant">{{ user.username[0].toUpperCase() }}</span>
            </div>
            <span class="truncate text-on-surface">{{ user.username }}</span>
          </li>
        }
      </ul>
    }
  </div>
</div>
```

Note: use `(mousedown)` not `(click)` on the `<li>` so the dropdown selection fires before the input's `(blur)` event would clear it.

- [ ] **Step 2: Run Angular typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/contacts/contacts-home/contacts-home.html
git commit -m "feat: contacts page typeahead dropdown UI"
```

---

### Task 3: Tests

**Files:**
- Modify: `frontend/src/app/features/contacts/contacts-home/contacts-home.spec.ts`

- [ ] **Step 1: Read the existing spec to understand mock patterns**

Check `contacts-home.spec.ts` for the existing provider setup and mock `UsersApiService` if not already present.

- [ ] **Step 2: Add 3 new tests**

The existing spec uses `HttpTestingController` — flush bootstrap HTTP calls in each test before exercising component methods. Add these tests inside the existing `describe` block (the `beforeEach`/`afterEach`/`http` variables are already available):

```typescript
it('onUsernameInput with 2+ chars returns suggestions excluding existing friends', async () => {
  const friends: FriendDto[] = [
    { friendshipId: 'f1', userId: 'u1', username: 'alice', avatarUrl: null, friendSince: '' },
  ];

  fixture.detectChanges();
  http.expectOne('/api/friends').flush(friends);
  http.expectOne('/api/friends/requests').flush([]);
  await fixture.whenStable();

  component.onUsernameInput('al');

  const searchReq = http.expectOne(r => r.url.includes('/api/users/search'));
  searchReq.flush([
    { id: 'u1', username: 'alice', avatarUrl: null },
    { id: 'u2', username: 'albert', avatarUrl: null },
  ]);
  await fixture.whenStable();

  expect(component.userSuggestions()).toHaveLength(1);
  expect(component.userSuggestions()[0].username).toBe('albert');
});

it('selectSuggestion fills username input and clears dropdown', async () => {
  fixture.detectChanges();
  http.expectOne('/api/friends').flush([]);
  http.expectOne('/api/friends/requests').flush([]);
  await fixture.whenStable();

  component.userSuggestions.set([{ id: 'u2', username: 'bob', avatarUrl: null }]);
  component.selectSuggestion({ id: 'u2', username: 'bob', avatarUrl: null });

  expect(component.newRequestUsername()).toBe('bob');
  expect(component.userSuggestions()).toHaveLength(0);
});

it('onUsernameInput with < 2 chars clears suggestions without calling API', async () => {
  fixture.detectChanges();
  http.expectOne('/api/friends').flush([]);
  http.expectOne('/api/friends/requests').flush([]);
  await fixture.whenStable();

  component.userSuggestions.set([{ id: 'u2', username: 'bob', avatarUrl: null }]);
  component.onUsernameInput('a');

  http.expectNone(r => r.url.includes('/api/users/search'));
  expect(component.userSuggestions()).toHaveLength(0);
});
```

- [ ] **Step 3: Run Angular tests — confirm all pass**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -8
```

Expected: all tests pass (0 failed).

- [ ] **Step 4: Final commit**

```bash
git add frontend/src/app/features/contacts/contacts-home/contacts-home.spec.ts
git commit -m "test: contacts page typeahead unit tests"
```

---

### Task 4: Update DEVELOPMENT_LOG.md

- [ ] **Step 1: Append T200 entry** (verify last T-number first)

```
`[2026-04-19 T200]` | **[Feature] Contacts page user typeahead for friend requests** | The "Send New Invitation" username input had no search assistance — users needed to know exact usernames. `UsersApiService.searchUsers()` already existed (used in ManageRoom). Added `userSuggestions` and `isSearchingUsers` signals to `ContactsHomeComponent`; `onUsernameInput()` fires on every keystroke after 2 chars, calls `searchUsers(query, 8)`, and filters results to exclude already-friends and pending outgoing request targets. `selectSuggestion()` fills the input and closes the dropdown. `(mousedown)` used on list items to beat the input blur event. Dropdown shows avatar initial + username, `data-testid="user-suggestion-{username}"` per item. | `frontend/.../contacts-home/contacts-home.{ts,html,spec.ts}` | **[VERIFIED]**
```

```bash
git add DEVELOPMENT_LOG.md
git commit -m "chore: log T200 contacts page typeahead"
```
