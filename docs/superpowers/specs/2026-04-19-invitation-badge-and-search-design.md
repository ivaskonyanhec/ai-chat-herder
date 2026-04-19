# Spec: Invitation Badge + Sidebar Search Filter

**Date:** 2026-04-19
**Status:** Approved

---

## Overview

Two independent improvements to `WorkspaceShellComponent`:

1. **Invitation badge** — a red dot on the "Invitations" header nav link when the user has ≥1 pending room invitations. Clears when the user navigates to `/app/invitations`.
2. **Sidebar search filter** — wire the existing static search input so it filters the Public Rooms and Private Rooms lists in real time.

---

## Feature 1: Invitation Badge

### Data flow

1. On shell init, call `GET /invitations`, count pending items, store in `pendingInvitationCount = signal(0)`.
2. Backend `SendInvitation` endpoint pushes `RoomInvitationReceived` SignalR event (the type already exists in `hub.models.ts` as `RoomInvitationReceivedEvent` but is currently never emitted) to the invitee's active connections via `IHubContext<PresenceHub>` + `IPresenceStore`.
3. `PresenceService` registers an `on('RoomInvitationReceived', ...)` handler and exposes an `invitationReceived = signal<RoomInvitationReceivedEvent | null>(null)`.
4. `WorkspaceShellComponent` constructor `effect()` watches `presence.invitationReceived()` and increments `pendingInvitationCount`.
5. A `Router.events` subscription (already present for `loadRooms`) adds: on `NavigationEnd` to `/app/invitations`, reset `pendingInvitationCount` to 0.

### UI

- Wrap `<a routerLink="/app/invitations">` in a `relative` span.
- Add `<span class="absolute -top-1 -right-2 w-2 h-2 bg-error rounded-full">` shown only when `pendingInvitationCount() > 0`.
- `data-testid="invitation-badge"` on the dot span.
- No number shown — dot only (aligns with "seen on visit" clearing model).

### Backend change

`RoomInvitationEndpoints.SendInvitation`:
- Inject `IHubContext<PresenceHub>` and `IPresenceStore`.
- After `SaveChangesAsync`, get invitee's connection IDs via `presence.GetConnectionIdsAsync`.
- Push `RoomInvitationReceived` with `{ invitationId, roomId, roomName, fromUserId }` to each connection.
- Expose `SendInvitationInternal` for unit-test access.

---

## Feature 2: Sidebar Search Filter

### Data flow

- Add `readonly searchQuery = signal('')` to `WorkspaceShellComponent`.
- Bind the existing search `<input>` (line 53 of the HTML): add `(input)="searchQuery.set($any($event.target).value)"`.
- Convert `publicRooms` and `privateRooms` from simple visibility filters to computed signals that also filter by `searchQuery()` (case-insensitive `includes`).

```ts
readonly publicRooms = computed(() => {
  const q = this.searchQuery().toLowerCase();
  return this.myRooms().filter(r =>
    r.visibility === 'Public' && (!q || r.name.toLowerCase().includes(q))
  );
});
```

- When a query is active and no rooms match, the existing `@empty` fallback ("No public/private rooms") renders naturally — no extra empty state needed.

---

## Error handling

- If `GET /invitations` fails on init, `pendingInvitationCount` stays 0 — no error shown (badge is enhancement, not critical).
- If `SendInvitation` fails to push SignalR (no active connections), it silently skips — same pattern as `BanMember`.

---

## Testing

### Backend (TDD)

- `SendInvitation_PushesRoomInvitationReceived_ToInviteeConnections` — verifies event sent when invitee is online.
- `SendInvitation_DoesNotPushSignalR_WhenInviteeHasNoConnections` — verifies no call when offline.

### Frontend (unit)

- Badge `<span data-testid="invitation-badge">` is visible when `pendingInvitationCount > 0`.
- Badge is hidden when count is 0.
- `pendingInvitationCount` resets to 0 on navigation to `/app/invitations`.
- `effect()` increments count when `presence.invitationReceived()` fires.
- Search: `publicRooms` excludes rooms whose names don't match the query.
- Search: empty query returns all rooms.

---

## Files touched

| File | Change |
|------|--------|
| `src/ChatHerder.API/Endpoints/RoomInvitationEndpoints.cs` | Inject hub/presence, push event, expose internal |
| `tests/.../Endpoints/RoomInvitationEndpointsTests.cs` | New test file, 2 tests |
| `frontend/.../hub.models.ts` | No change needed (type already exists) |
| `frontend/.../presence.service.ts` | Register handler, expose `invitationReceived` signal |
| `frontend/.../workspace-shell.component.ts` | `pendingInvitationCount` signal, bootstrap load, effect, nav clear, `searchQuery` signal, updated `publicRooms`/`privateRooms` computed |
| `frontend/.../workspace-shell.component.html` | Badge dot on Invitations link, bind search input |
| `frontend/.../workspace-shell.component.spec.ts` | Add mock `invitationReceived` to stub, new tests |
