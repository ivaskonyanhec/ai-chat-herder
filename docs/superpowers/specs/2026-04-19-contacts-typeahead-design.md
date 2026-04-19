# Spec: Contacts Page — User Typeahead for Friend Requests

**Date:** 2026-04-19
**Status:** Approved

---

## Overview

The "Send New Invitation" form on the Contacts page has a plain username input with no search assistance. Users must know the exact username to send a friend request. This spec adds a typeahead dropdown powered by the existing `GET /api/users/search` endpoint.

No backend changes required — `UsersApiService.searchUsers()` already exists. The pattern mirrors `ManageRoomComponent.onInviteUsernameInput()`.

---

## Data flow

1. `(ngModelChange)` on `newRequestUsername` input fires `onUsernameInput(value)`.
2. If `value.trim().length < 2`: clear `userSuggestions`, return.
3. Otherwise: set `isSearchingUsers = true`, call `usersApi.searchUsers(query, 8)`.
4. On result: filter out users who are:
   - Already friends (match by `username` against `friends()`)
   - Have a pending **outgoing** request (match by `username` against `outgoingRequests()` sender targets — use `receiverUsername` if available, or cross-reference by `receiverId` vs loaded users)
   - The current user themselves (`user()?.id`)
5. Set `userSuggestions` to filtered results. Set `isSearchingUsers = false`.
6. Selecting a suggestion: set `newRequestUsername` to the selected username, clear `userSuggestions`.
7. On form submit (`sendFriendRequest`): clear `userSuggestions`.

---

## New signals on `ContactsHomeComponent`

```ts
readonly userSuggestions = signal<UserSearchResult[]>([]);
readonly isSearchingUsers = signal(false);
```

Inject `UsersApiService` and `AuthSessionService` (already injected).

---

## UI changes (`contacts-home.html`)

- Wrap the `newRequestUsername` input in a `relative` container div.
- Change `(ngModelChange)` to also call `onUsernameInput($event)` — or use the existing binding and add a separate `(input)` handler.
- Add a spinner icon inside the input (right edge) shown when `isSearchingUsers()`.
- Below the input, add:

```html
@if (userSuggestions().length > 0) {
  <ul class="absolute left-0 right-0 top-full mt-1 bg-surface-container-lowest rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto border border-outline-variant/10">
    @for (user of userSuggestions(); track user.id) {
      <li class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container cursor-pointer text-sm"
          [attr.data-testid]="'user-suggestion-' + user.username"
          (click)="selectSuggestion(user)">
        <div class="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
          <span class="text-[10px] font-bold text-on-surface-variant">{{ user.username[0].toUpperCase() }}</span>
        </div>
        <span class="truncate text-on-surface">{{ user.username }}</span>
      </li>
    }
  </ul>
}
```

---

## New methods on `ContactsHomeComponent`

```ts
onUsernameInput(value: string): void {
  // debounce-free, 2-char minimum, same pattern as ManageRoomComponent
}

selectSuggestion(user: UserSearchResult): void {
  this.newRequestUsername.set(user.username);
  this.userSuggestions.set([]);
}
```

---

## Filtering logic

Exclude a search result if any of the following:
- `result.username === this.user()?.username` (self)
- `this.friends().some(f => f.username.toLowerCase() === result.username.toLowerCase())` (already friends)
- `this.outgoingRequests().some(r => r.receiverUsername?.toLowerCase() === result.username.toLowerCase())` (pending outgoing)

---

## Error handling

- If `searchUsers` fails, silently clear suggestions (non-critical; user can still type exact username).

---

## Testing

### Frontend unit tests

1. `onUsernameInput with 2+ chars shows filtered suggestions` — friends excluded from results.
2. `selectSuggestion fills input and clears dropdown`.
3. `onUsernameInput with < 2 chars clears suggestions`.

---

## Files touched

| File | Change |
|------|--------|
| `frontend/.../contacts-home/contacts-home.ts` | Add `userSuggestions`, `isSearchingUsers` signals; `onUsernameInput`, `selectSuggestion` methods; inject `UsersApiService` |
| `frontend/.../contacts-home/contacts-home.html` | Wrap input in `relative` div, add dropdown, add spinner |
| `frontend/.../contacts-home/contacts-home.spec.ts` | 3 new unit tests |
