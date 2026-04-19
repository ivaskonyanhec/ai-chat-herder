# Final Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three remaining implementation gaps: real-time ban broadcast, reply/quote display UI, and room member sidebar with live presence status.

**Architecture:** Backend adds SignalR broadcast to `BanMember` following the same `IPresenceStore` + `IHubContext<PresenceHub>` pattern already used in `AuthEndpoints.DeleteAccount`. Frontend adds two pure template changes (reply quote block) and one Signals-based member sidebar that derives live status from `PresenceService.presenceMap`.

**Tech Stack:** .NET 10 Minimal APIs, NSubstitute + xUnit, SQLite in-memory (required for `ExecuteDeleteAsync`), Angular 21 Signals + Standalone components, Vitest.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/ChatHerder.API/Endpoints/RoomEndpoints.cs` | Modify | Add `IHubContext<PresenceHub>` + `IPresenceStore` to `BanMember`; add `BanMemberInternal` bridge |
| `tests/ChatHerder.Unit.Tests/Endpoints/RoomEndpointsTests.cs` | Modify | Add SQLite context helper + 1 test for `BanMember` broadcast |
| `frontend/src/app/features/rooms/room-chat/room-chat.html` | Modify | Add reply-quote block; add right member sidebar |
| `frontend/src/app/features/rooms/room-chat/room-chat.ts` | Modify | Add `members` signal + effects from PresenceService; expose `presenceMap` |
| `frontend/src/app/features/rooms/room-chat/room-chat.spec.ts` | Modify | Add `roomMembersSnapshot` stub + member sidebar test |
| `frontend/src/app/features/dialogs/direct-messages/direct-messages.html` | Modify | Add reply-quote block in DM thread |
| `DEVELOPMENT_LOG.md` | Modify | Log T154–T157 |

---

## Task 1: BanMember — broadcast RemovedFromRoom via SignalR

**Files:**
- Modify: `src/ChatHerder.API/Endpoints/RoomEndpoints.cs`
- Modify: `tests/ChatHerder.Unit.Tests/Endpoints/RoomEndpointsTests.cs`

**Context:** `BanMember` persists the ban and deletes the membership, but never tells the banned user's browser. The Angular `PresenceService` already listens for `RemovedFromRoom` on the presence connection (line 122 of `presence.service.ts`) and removes the room from `joinedRooms`. The pattern to broadcast from an endpoint is identical to `AuthEndpoints.DeleteAccount`: inject `IPresenceStore` to get connection IDs, then `IHubContext<PresenceHub>` to send.

**Important:** `BanMember` calls `ExecuteDeleteAsync` which requires a relational EF provider. The existing `BuildContext()` in `RoomEndpointsTests.cs` uses InMemory EF — add a separate `BuildSqliteContext()` for this test only.

- [ ] **Step 1: Write the failing test**

Add `BuildSqliteContext()` helper and one new test inside `RoomEndpointsTests` class in `tests/ChatHerder.Unit.Tests/Endpoints/RoomEndpointsTests.cs`. Also extend `RoomEndpointsHelper` at the bottom of the file:

```csharp
// Add inside the RoomEndpointsTests class, after BuildContext():

private static AppDbContext BuildSqliteContext()
{
    var opts = new DbContextOptionsBuilder<AppDbContext>()
        .UseSqlite($"Data Source=file:banmember-{Guid.NewGuid():N}?mode=memory&cache=shared")
        .Options;
    var db = new AppDbContext(opts);
    db.Database.EnsureCreated();
    return db;
}

[Fact]
public async Task BanMember_SendsRemovedFromRoom_ToActiveBannedUserConnections()
{
    await using var db = BuildSqliteContext();

    var ownerId  = Guid.NewGuid();
    var targetId = Guid.NewGuid();
    db.Users.AddRange(
        new User { Id = ownerId,  Username = "owner",  Email = "o@x.com", PasswordHash = "x" },
        new User { Id = targetId, Username = "target", Email = "t@x.com", PasswordHash = "x" });
    var room = new Room { OwnerId = ownerId, Name = "r", Visibility = RoomVisibility.Public };
    db.Rooms.Add(room);
    db.RoomMemberships.AddRange(
        new RoomMembership { RoomId = room.Id, UserId = ownerId,  Role = MemberRole.Owner  },
        new RoomMembership { RoomId = room.Id, UserId = targetId, Role = MemberRole.Member });
    await db.SaveChangesAsync();

    var presence    = Substitute.For<IPresenceStore>();
    presence.GetConnectionIdsAsync(targetId).Returns(new[] { "conn-banned" });

    var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
    var hubClients  = Substitute.For<IHubClients>();
    presenceHub.Clients.Returns(hubClients);
    var clientProxy = Substitute.For<IClientProxy>();
    hubClients.Client("conn-banned").Returns(clientProxy);

    var result = await RoomEndpointsHelper.BanMember(
        room.Id, targetId,
        new BanMemberRequest("test ban"),
        MakePrincipal(ownerId),
        db, presenceHub, presence,
        CancellationToken.None);

    Assert.Equal(204, GetStatusCode(result));
    Assert.Equal(1, await db.RoomBans.CountAsync());
    Assert.Equal(0, await db.RoomMemberships.CountAsync(m => m.UserId == targetId));
    await clientProxy.Received(1).SendCoreAsync(
        "RemovedFromRoom", Arg.Any<object[]>(), Arg.Any<CancellationToken>());
}
```

Add the required usings at the top of `RoomEndpointsTests.cs` if not already present:
```csharp
using ChatHerder.API.Hubs;
using ChatHerder.Application.Ports;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore.Sqlite; // enables UseSqlite
using NSubstitute;
```

Extend `RoomEndpointsHelper` at the bottom:
```csharp
public static Task<IResult> BanMember(
    Guid id, Guid userId, BanMemberRequest req,
    System.Security.Claims.ClaimsPrincipal principal, AppDbContext db,
    IHubContext<PresenceHub> presenceHub, IPresenceStore presence,
    CancellationToken ct)
    => ChatHerder.API.Endpoints.RoomEndpoints.BanMemberInternal(
        id, userId, req, principal, db, presenceHub, presence, ct);
```

- [ ] **Step 2: Run test to confirm it fails (compile error — `BanMemberInternal` not defined)**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ --filter "BanMember" 2>&1 | tail -10
```

Expected: Build error — `RoomEndpoints` does not contain `BanMemberInternal`.

- [ ] **Step 3: Implement BanMember broadcast in RoomEndpoints.cs**

Add the required usings at the top of `src/ChatHerder.API/Endpoints/RoomEndpoints.cs` if not already present:
```csharp
using ChatHerder.Application.Ports;
using Microsoft.AspNetCore.SignalR;
```

Add `BanMemberInternal` bridge after the existing `JoinRoomInternal` bridge (around line 39):
```csharp
internal static Task<IResult> BanMemberInternal(
    Guid id, Guid userId, BanMemberRequest req,
    ClaimsPrincipal principal, AppDbContext db,
    IHubContext<PresenceHub> presenceHub, IPresenceStore presence,
    CancellationToken ct)
    => BanMember(id, userId, req, principal, db, presenceHub, presence, ct);
```

Replace the existing `BanMember` private method (currently at lines 367–397) with:
```csharp
private static async Task<IResult> BanMember(
    Guid id,
    Guid userId,
    BanMemberRequest req,
    ClaimsPrincipal principal,
    AppDbContext db,
    IHubContext<PresenceHub> presenceHub,
    IPresenceStore presence,
    CancellationToken ct)
{
    if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
        return Results.Unauthorized();

    if (!await IsAdminOrOwner(db, id, callerId, ct)) return Results.Forbid();

    var targetMembership = await db.RoomMemberships
        .FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
    if (targetMembership is null) return Results.NotFound();
    if (targetMembership.Role == MemberRole.Owner)
        return Results.BadRequest(new { error = "Cannot ban the room owner." });

    db.RoomBans.Add(new RoomBan
    {
        RoomId = id,
        BannedUserId = userId,
        BannedByUserId = callerId,
        Reason = req.Reason,
    });
    await db.RoomMemberships.Where(m => m.RoomId == id && m.UserId == userId).ExecuteDeleteAsync(ct);
    await db.SaveChangesAsync(ct);

    // Notify banned user's active connections to leave the room
    var connIds = await presence.GetConnectionIdsAsync(userId, ct);
    foreach (var connId in connIds)
        await presenceHub.Clients.Client(connId)
            .SendAsync("RemovedFromRoom", new { roomId = id }, cancellationToken: ct);

    return Results.NoContent();
}
```

The DI registration line `group.MapPost("/{id:guid}/members/{userId:guid}/ban", BanMember)` will automatically pick up the two new parameters from ASP.NET Core DI — no registration change needed.

- [ ] **Step 4: Run test to confirm GREEN**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ --filter "BanMember" 2>&1 | tail -10
```

Expected:
```
Test Run Successful.
Total tests: 1
     Passed: 1
```

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ 2>&1 | tail -5
```

Expected: `Passed: 99` (was 98, +1).

- [ ] **Step 6: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add src/ChatHerder.API/Endpoints/RoomEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/RoomEndpointsTests.cs
git commit -m "feat: BanMember broadcasts RemovedFromRoom to banned user's active SignalR connections"
```

---

## Task 2: Reply/Quote Display UI

**Files:**
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.html`
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.html`

**Context:** `MessageDto.replyTo` and `DialogMessageDto.replyTo` are already populated by the backend and included in the serialized response. The frontend just needs to render them. No TypeScript changes needed — the data is already in the model. No new Angular tests needed — this is a template-only change covered by the existing skipped E2E test once the stack is available.

- [ ] **Step 1: Add reply quote block to room-chat.html**

In `frontend/src/app/features/rooms/room-chat/room-chat.html`, inside the `@else` branch (non-deleted message), insert the reply quote block **before** the content paragraph. Find:

```html
              } @else {
                <p class="text-sm text-on-surface leading-relaxed max-w-2xl" data-testid="message-text">{{ msg.content }}</p>
```

Replace with:

```html
              } @else {
                @if (msg.replyTo) {
                  <div class="border-l-2 border-primary/50 pl-2 mb-1 rounded-sm bg-surface-container/50"
                       data-testid="reply-quote">
                    <p class="text-[10px] font-bold text-primary">{{ msg.replyTo.sender.username }}</p>
                    <p class="text-xs text-on-surface-variant truncate max-w-sm">{{ msg.replyTo.content }}</p>
                  </div>
                }
                <p class="text-sm text-on-surface leading-relaxed max-w-2xl" data-testid="message-text">{{ msg.content }}</p>
```

- [ ] **Step 2: Add reply quote block to direct-messages.html**

In `frontend/src/app/features/dialogs/direct-messages/direct-messages.html`, inside the `@if (!msg.isDeleted)` branch, find the content paragraph:

```html
                  <p>{{ msg.content }}</p>
```

Replace with:

```html
                  @if (msg.replyTo) {
                    <div class="border-l-2 border-current/30 pl-2 mb-1 opacity-70"
                         data-testid="reply-quote">
                      <p class="text-[10px] font-bold">{{ msg.replyTo.sender.username }}</p>
                      <p class="text-xs truncate max-w-[14rem]">{{ msg.replyTo.content }}</p>
                    </div>
                  }
                  <p>{{ msg.content }}</p>
```

- [ ] **Step 3: Run Angular tests to confirm no regressions**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --watch=false 2>&1 | tail -5
```

Expected: `Tests 113 passed` (count unchanged — template-only change).

- [ ] **Step 4: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/features/rooms/room-chat/room-chat.html \
        frontend/src/app/features/dialogs/direct-messages/direct-messages.html
git commit -m "feat: render reply/quote block in room-chat and DM thread when replyTo is present"
```

---

## Task 3: Room Member Sidebar with Live Presence Status

**Files:**
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.ts`
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.html`
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.spec.ts`

**Context:** When `PresenceHub.JoinRoom` is called, it sends a `RoomMembersSnapshot` event to the caller with all members and their current presence status. `PresenceService` already stores this in `roomMembersSnapshot` signal. As users join/leave or change status, `memberJoined`/`memberLeft`/`presenceMap` signals update. The component needs to maintain a local `members` list derived from these signals, and the template renders a right sidebar with status dots using `data-testid="member-status-{userId}"`.

- [ ] **Step 1: Write the failing test**

Read `frontend/src/app/features/rooms/room-chat/room-chat.spec.ts` first (the existing file has 1 test: `should create`).

Replace the entire spec file with:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { RoomChatComponent } from './room-chat';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import type { RoomDto } from '../../../core/rooms/rooms.models';
import type { RoomMembersSnapshotEvent } from '../../../core/signalr/hub.models';

const mockRoom: RoomDto = {
  id: 'room-1',
  name: 'Test Room',
  description: null,
  visibility: 'Public',
  ownerId: 'user-1',
  createdAt: new Date().toISOString(),
  memberCount: 3,
  callerRole: 'Member',
};

const mockSnapshot: RoomMembersSnapshotEvent = {
  roomId: 'room-1',
  members: [
    { userId: 'user-1', username: 'alice', avatarUrl: null, role: 'Owner', joinedAt: new Date().toISOString(), presenceStatus: 'online' },
    { userId: 'user-2', username: 'bob',   avatarUrl: null, role: 'Member', joinedAt: new Date().toISOString(), presenceStatus: 'offline' },
  ],
};

function buildProviders(snapshotOverride?: RoomMembersSnapshotEvent | null) {
  const snapshotSignal = signal<RoomMembersSnapshotEvent | null>(snapshotOverride ?? null);
  return {
    snapshotSignal,
    providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'room-1' } } } },
      { provide: AuthSessionService, useValue: { user: signal(null), accessToken: signal(null) } },
      {
        provide: RoomsApiService,
        useValue: { getRoom: () => of(mockRoom), getMessages: () => of([]) },
      },
      {
        provide: ChatService,
        useValue: { lastRoomEvent: signal(null), sendMessage: () => Promise.resolve() },
      },
      {
        provide: PresenceService,
        useValue: {
          joinRoom: vi.fn().mockResolvedValue(undefined),
          leaveRoom: vi.fn().mockResolvedValue(undefined),
          roomMembersSnapshot: snapshotSignal.asReadonly(),
          memberJoined: signal(null).asReadonly(),
          memberLeft: signal(null).asReadonly(),
          presenceMap: signal(new Map<string, 'online' | 'afk' | 'offline'>()).asReadonly(),
        },
      },
      {
        provide: FilesApiService,
        useValue: { uploadFile: () => of(), downloadFile: () => {}, getFileUrl: () => '' },
      },
      {
        provide: NotificationsApiService,
        useValue: { markRoomRead: () => of(void 0) },
      },
    ],
  };
}

describe('RoomChatComponent', () => {
  it('should create', async () => {
    const { providers } = buildProviders();
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders member sidebar with status dots from roomMembersSnapshot', async () => {
    const { providers } = buildProviders(mockSnapshot);
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="member-status-user-1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="member-status-user-2"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --watch=false --reporter=verbose 2>&1 | grep -E "FAIL|member sidebar|member-status" | head -10
```

Expected: `renders member sidebar with status dots from roomMembersSnapshot` fails because the template has no `member-status-*` elements.

- [ ] **Step 3: Add members signal and effects to room-chat.ts**

Read `frontend/src/app/features/rooms/room-chat/room-chat.ts` first.

At the top, add the missing import (if not already present):
```typescript
import type { RoomMemberPresence } from '../../../core/signalr/hub.models';
```

Inside `RoomChatComponent`, add these new fields after the existing signals (after `pendingAttachment`):
```typescript
readonly members = signal<RoomMemberPresence[]>([]);
readonly presenceMap = this.presence.presenceMap;
```

In the `constructor()`, after the existing `chat.lastRoomEvent` effect, add three new effects:
```typescript
effect(() => {
  const snap = this.presence.roomMembersSnapshot();
  if (!snap || snap.roomId !== this.roomId()) return;
  this.members.set(snap.members);
});

effect(() => {
  const event = this.presence.memberJoined();
  if (!event || event.roomId !== this.roomId()) return;
  const status = this.presence.presenceMap().get(event.user.userId) ?? 'online';
  this.members.update(list => [
    ...list.filter(m => m.userId !== event.user.userId),
    {
      userId:         event.user.userId,
      username:       event.user.username,
      avatarUrl:      event.user.avatarUrl,
      role:           'Member',
      joinedAt:       new Date().toISOString(),
      presenceStatus: status,
    },
  ]);
});

effect(() => {
  const event = this.presence.memberLeft();
  if (!event || event.roomId !== this.roomId()) return;
  this.members.update(list => list.filter(m => m.userId !== event.userId));
});
```

- [ ] **Step 4: Add member sidebar to room-chat.html**

In `frontend/src/app/features/rooms/room-chat/room-chat.html`, the top-level structure is:
```html
<div class="room-chat flex h-full overflow-hidden">
  <section class="flex flex-col flex-1 ...">  <!-- Chat Canvas -->
  ...
  </section>
</div>
```

Add a new `<aside>` **after** the closing `</section>` tag of the Chat Canvas (before the closing `</div>`):

```html
  <!-- Right Sidebar: Online Members -->
  <aside class="bg-surface-container w-56 shrink-0 h-full overflow-y-auto hidden lg:flex flex-col p-4 border-l border-outline-variant/10">
    <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Members</p>
    @for (member of members(); track member.userId) {
      <div class="flex items-center gap-2 py-1">
        <div class="relative shrink-0">
          @if (member.avatarUrl) {
            <img [src]="member.avatarUrl" [alt]="member.username" class="w-7 h-7 rounded-full object-cover" />
          } @else {
            <div class="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center">
              <span class="text-[10px] font-bold text-on-surface-variant">{{ member.username[0].toUpperCase() }}</span>
            </div>
          }
          <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-container"
                [attr.data-testid]="'member-status-' + member.userId"
                [class]="(presenceMap().get(member.userId) ?? member.presenceStatus) === 'online'
                  ? 'bg-green-500'
                  : (presenceMap().get(member.userId) ?? member.presenceStatus) === 'afk'
                  ? 'bg-yellow-400'
                  : 'bg-outline'">
          </span>
        </div>
        <span class="text-xs text-on-surface truncate">{{ member.username }}</span>
      </div>
    }
  </aside>
```

- [ ] **Step 5: Run tests to confirm GREEN**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --watch=false 2>&1 | tail -5
```

Expected: `Tests 114 passed` (was 113, +1 new member sidebar test). The count stays the same if the old `should create` test was the only one; +1 because we added `renders member sidebar`.

Wait — the old spec had 1 test (`should create`), the new spec has 2 tests (`should create` + `renders member sidebar`). Net: +1.
Expected: `Tests 114 passed`.

- [ ] **Step 6: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/features/rooms/room-chat/room-chat.ts \
        frontend/src/app/features/rooms/room-chat/room-chat.html \
        frontend/src/app/features/rooms/room-chat/room-chat.spec.ts
git commit -m "feat: room member sidebar with live presence status dots"
```

---

## Task 4: DEVELOPMENT_LOG

**Files:**
- Modify: `DEVELOPMENT_LOG.md`

- [ ] **Step 1: Find the last T-number**

```bash
grep -E "^\`\[2026" /Users/igorvaskonyan/projects/ai/ai-chat-herder/DEVELOPMENT_LOG.md | tail -1
```

Expected: last entry is `T153`. Next entries start at `T154`.

- [ ] **Step 2: Append log entries**

Append to `DEVELOPMENT_LOG.md` (the last existing line, then add new entries below it):

```
`[2026-04-19 T154]` | **[Phase 4k][Cloned agent 2] BanMember broadcasts RemovedFromRoom via SignalR** | TDD: wrote 1 failing test (compile error — `BanMemberInternal` missing), implemented, GREEN. Root cause: BanMember persisted the ban and deleted the membership but never sent a real-time notification to the banned user's active browser connections. Fixed: added `IHubContext<PresenceHub>` and `IPresenceStore` parameters to `BanMember`, following the same pattern as `AuthEndpoints.DeleteAccount.ForceDisconnect`. After SaveChanges, calls `presence.GetConnectionIdsAsync(bannedUserId)` and sends `RemovedFromRoom` to each connection via `presenceHub.Clients.Client(connId)`. Angular `PresenceService` already had the handler (line 122), so no frontend changes needed. Added `BanMemberInternal` bridge method. Test uses SQLite in-memory (required for ExecuteDeleteAsync). Full .NET suite 99/99. | `RoomEndpoints.cs`, `RoomEndpointsTests.cs` | **[BUILD]**

`[2026-04-19 T155]` | **[Angular][Cloned agent 2] Reply/quote display in room-chat and DM thread** | Template-only. Added `@if (msg.replyTo)` quote block above message content in `room-chat.html` and `direct-messages.html`. Shows quoted sender username and truncated content with `data-testid="reply-quote"`. `MessageDto.replyTo` and `DialogMessageDto.replyTo` were already populated by the backend; only the rendering was missing. No TS changes. Angular suite unchanged. Unblocks E2E test "reply/reference flow shows quoted message UI". | `room-chat.html`, `direct-messages.html` | **[BUILD]**

`[2026-04-19 T156]` | **[Angular][Cloned agent 2] Room member sidebar with live presence status** | Added `members: Signal<RoomMemberPresence[]>` to `RoomChatComponent`, populated by three `effect()` blocks tracking `PresenceService.roomMembersSnapshot` (initial bulk snapshot on join), `memberJoined` (add member), and `memberLeft` (remove member). Status dots rendered in new right sidebar using `presenceMap().get(member.userId)` for live reactivity — so status changes via `UserStatusChanged` events update the UI without component intervention. `data-testid="member-status-{userId}"` attribute present on each dot for E2E assertions. Added 1 new test (sidebar renders from snapshot). Full Angular suite 114/114. Unblocks E2E test "presence dots update in the room member list UI". | `room-chat.ts`, `room-chat.html`, `room-chat.spec.ts` | **[BUILD]**
```

- [ ] **Step 3: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add DEVELOPMENT_LOG.md
git commit -m "docs: log T154–T156 final gap fixes"
```

---

## Self-Review

**1. Spec coverage:**
- BanMember real-time broadcast ✅ Task 1
- Reply/quote display in room chat ✅ Task 2 (room-chat.html)
- Reply/quote display in DM thread ✅ Task 2 (direct-messages.html)
- Room member sidebar with `data-testid="member-status-{userId}"` ✅ Task 3
- Live presence status reactivity via `presenceMap` signal ✅ Task 3
- DEVELOPMENT_LOG ✅ Task 4

**2. Placeholder scan:** No TBD/TODO/placeholder text. All steps contain actual code.

**3. Type consistency:**
- `RoomMemberPresence.presenceStatus` matches `PresenceStatus` type from hub.models.ts ✅
- `presenceMap().get(member.userId)` returns `PresenceStatus | undefined` — `?? member.presenceStatus` fallback handles undefined ✅
- `BanMemberInternal` parameter order matches `BanMember` private method ✅
- `GetConnectionIdsAsync` returns `IReadOnlyList<string>` — iterable with `foreach` ✅
- `BanMemberRequest` already imported in `RoomEndpointsTests.cs` (it's in `ChatHerder.Application.DTOs`) ✅
- `MemberJoinedEvent.user` is `RoomMemberJoined` (has `userId`, `username`, `avatarUrl`) — `role`/`joinedAt` filled with defaults in `memberJoined` effect ✅
