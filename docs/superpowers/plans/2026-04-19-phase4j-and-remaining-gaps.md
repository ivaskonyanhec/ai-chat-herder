# Phase 4j + Remaining Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the three real remaining gaps: account deletion cascade + ForceDisconnect, DM real-time delivery via JoinDialog/LeaveDialog, and E2E message selectors.

**Architecture:** Backend uses the existing `internal static` testable-core pattern (expose `internal` bridge methods so unit tests can invoke private Minimal API handlers directly). Angular uses PresenceService as the hub-invoke gateway — DirectMessagesComponent calls `presence.joinDialog/leaveDialog` when navigating conversations, exactly mirroring how RoomChatComponent calls `presence.joinRoom/leaveRoom`.

**Tech Stack:** .NET 10 Minimal APIs (NSubstitute + xUnit, InMemory EF), ASP.NET Core SignalR (IHubContext<PresenceHub>), Angular 21 Signals + Standalone components (Vitest).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/ChatHerder.API/Endpoints/AuthEndpoints.cs` | Modify | Add owned-room cascade + ForceDisconnect to `DeleteAccount`; expose `internal` bridge |
| `tests/ChatHerder.Unit.Tests/Endpoints/AuthEndpointsTests.cs` | Create | 2 unit tests for DeleteAccount cascade |
| `src/ChatHerder.API/Hubs/PresenceHub.cs` | Modify | Add `JoinDialog`/`LeaveDialog`; clean up dialog groups in `OnDisconnectedAsync` |
| `tests/ChatHerder.Unit.Tests/Hubs/PresenceHubTests.cs` | Modify | Add 2 unit tests for JoinDialog |
| `frontend/src/app/core/signalr/presence.service.ts` | Modify | Add `joinDialog`/`leaveDialog`/`rejoinAllDialogs` |
| `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts` | Modify | Call `presence.joinDialog`/`leaveDialog` in `selectDialog` |
| `frontend/src/app/features/dialogs/direct-messages/direct-messages.spec.ts` | Modify | Add PresenceService stub; verify `joinDialog` called on selectDialog |
| `frontend/src/app/features/rooms/room-chat/room-chat.html` | Modify | Add `data-testid` to message elements |

---

## Task 1: Phase 4j — Account Deletion Cascade + ForceDisconnect

**Files:**
- Modify: `src/ChatHerder.API/Endpoints/AuthEndpoints.cs`
- Create: `tests/ChatHerder.Unit.Tests/Endpoints/AuthEndpointsTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/ChatHerder.Unit.Tests/Endpoints/AuthEndpointsTests.cs`:

```csharp
using ChatHerder.API.Endpoints;
using ChatHerder.API.Hubs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class AuthEndpointsTests
{
    private static AppDbContext BuildContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static ClaimsPrincipal Principal(Guid userId) =>
        new(new ClaimsIdentity([
            new Claim("user_id", userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test"));

    private static int StatusCode(IResult result) =>
        (int)(result.GetType().GetProperty("StatusCode")?.GetValue(result) ?? 0);

    [Fact]
    public async Task DeleteAccount_DeletesOwnedRoomsAndFiles()
    {
        await using var db = BuildContext();
        var userId = Guid.NewGuid();
        db.Users.Add(new User { Id = userId, Username = "alice", Email = "a@x.com", PasswordHash = "x" });
        var room = new Room { Name = "r", OwnerId = userId, Visibility = RoomVisibility.Public };
        db.Rooms.Add(room);
        var msg = new Message { RoomId = room.Id, AuthorId = userId, Content = "hi", SentAt = DateTime.UtcNow, SequenceNumber = 1 };
        db.Messages.Add(msg);
        var att = new Attachment
        {
            MessageId        = msg.Id,
            UploadedByUserId = userId,
            StoragePath      = "uploads/f.png",
            FileName         = "f.png",
            ContentType      = "image/png",
            SizeBytes        = 1,
        };
        db.Attachments.Add(att);
        await db.SaveChangesAsync();

        var sessions     = Substitute.For<ISessionStore>();
        var storage      = Substitute.For<IFileStorage>();
        var presence     = Substitute.For<IPresenceStore>();
        var presenceHub  = Substitute.For<IHubContext<PresenceHub>>();
        presenceHub.Clients.Returns(Substitute.For<IHubClients>());
        presenceHub.Clients.Client(Arg.Any<string>()).Returns(Substitute.For<IClientProxy>());
        presence.GetConnectionIdsAsync(userId).Returns(Array.Empty<string>());

        var result = await AuthEndpointsHelper.DeleteAccount(
            Principal(userId), db, sessions, storage, presence, presenceHub, CancellationToken.None);

        Assert.Equal(204, StatusCode(result));
        await storage.Received(1).DeleteAsync("uploads/f.png", Arg.Any<CancellationToken>());
        Assert.False(await db.Rooms.AnyAsync(r => r.OwnerId == userId));
        Assert.False(await db.Messages.AnyAsync(m => m.RoomId == room.Id));
    }

    [Fact]
    public async Task DeleteAccount_SendsForceDisconnect_ToAllConnections()
    {
        await using var db = BuildContext();
        var userId = Guid.NewGuid();
        db.Users.Add(new User { Id = userId, Username = "bob", Email = "b@x.com", PasswordHash = "x" });
        await db.SaveChangesAsync();

        var sessions    = Substitute.For<ISessionStore>();
        var storage     = Substitute.For<IFileStorage>();
        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(userId).Returns(new[] { "conn-1", "conn-2" });

        var presenceHub  = Substitute.For<IHubContext<PresenceHub>>();
        var hubClients   = Substitute.For<IHubClients>();
        presenceHub.Clients.Returns(hubClients);
        var clientProxy  = Substitute.For<IClientProxy>();
        hubClients.Client(Arg.Any<string>()).Returns(clientProxy);

        await AuthEndpointsHelper.DeleteAccount(
            Principal(userId), db, sessions, storage, presence, presenceHub, CancellationToken.None);

        await clientProxy.Received(2).SendCoreAsync(
            "ForceDisconnect", Arg.Any<object[]>(), Arg.Any<CancellationToken>());
    }
}

internal static class AuthEndpointsHelper
{
    public static Task<IResult> DeleteAccount(
        ClaimsPrincipal principal,
        AppDbContext db,
        ISessionStore sessions,
        IFileStorage storage,
        IPresenceStore presence,
        IHubContext<PresenceHub> presenceHub,
        CancellationToken ct)
        => ChatHerder.API.Endpoints.AuthEndpoints.DeleteAccountInternal(
            principal, db, sessions, storage, presence, presenceHub, ct);
}
```

- [ ] **Step 2: Run tests to confirm they fail (compile error — `DeleteAccountInternal` doesn't exist yet)**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ --filter "FullyQualifiedName~AuthEndpointsTests" 2>&1 | tail -10
```

Expected: Build error — `AuthEndpoints` does not contain a definition for `DeleteAccountInternal`.

- [ ] **Step 3: Implement the cascade in AuthEndpoints.cs**

Add `using Microsoft.AspNetCore.SignalR;` to the usings at the top of `AuthEndpoints.cs` (it may already be there — check first).

Add the `internal` bridge method directly after the `MapAuthEndpoints` method body (before the first private method):

```csharp
internal static Task<IResult> DeleteAccountInternal(
    ClaimsPrincipal principal,
    AppDbContext db,
    ISessionStore sessions,
    IFileStorage storage,
    IPresenceStore presence,
    IHubContext<PresenceHub> presenceHub,
    CancellationToken ct)
    => DeleteAccount(principal, db, sessions, storage, presence, presenceHub, ct);
```

Replace the existing `private static async Task<IResult> DeleteAccount(...)` method (lines 287–321) with:

```csharp
private static async Task<IResult> DeleteAccount(
    ClaimsPrincipal principal,
    AppDbContext db,
    ISessionStore sessions,
    IFileStorage storage,
    IPresenceStore presence,
    IHubContext<PresenceHub> presenceHub,
    CancellationToken ct)
{
    var userId = Guid.Parse(principal.FindFirstValue("user_id")!);

    var user = await db.Users.FindAsync([userId], ct);
    if (user is null) return Results.NotFound();

    // Cascade-delete owned rooms: files → attachments → messages → bans/invitations/memberships → room
    var ownedRoomIds = await db.Rooms
        .Where(r => r.OwnerId == userId)
        .Select(r => r.Id)
        .ToListAsync(ct);

    foreach (var roomId in ownedRoomIds)
    {
        var msgIds = await db.Messages
            .Where(m => m.RoomId == roomId)
            .Select(m => m.Id)
            .ToListAsync(ct);

        var attachmentPaths = await db.Attachments
            .Where(a => a.MessageId != null && msgIds.Contains(a.MessageId.Value))
            .Select(a => a.StoragePath)
            .ToListAsync(ct);

        foreach (var path in attachmentPaths)
            await storage.DeleteAsync(path, ct);

        await db.Attachments
            .Where(a => a.MessageId != null && msgIds.Contains(a.MessageId.Value))
            .ExecuteDeleteAsync(ct);
        await db.Messages      .Where(m => m.RoomId == roomId) .ExecuteDeleteAsync(ct);
        await db.RoomBans      .Where(b => b.RoomId == roomId) .ExecuteDeleteAsync(ct);
        await db.RoomInvitations.Where(i => i.RoomId == roomId).ExecuteDeleteAsync(ct);
        await db.RoomMemberships.Where(m => m.RoomId == roomId).ExecuteDeleteAsync(ct);
    }

    await db.Rooms.Where(r => r.OwnerId == userId).ExecuteDeleteAsync(ct);

    // Remove remaining (non-owned) room memberships
    await db.RoomMemberships
        .Where(m => m.UserId == userId)
        .ExecuteDeleteAsync(ct);

    // Remove social graph
    await db.FriendRequests
        .Where(r => r.SenderId == userId || r.ReceiverId == userId)
        .ExecuteDeleteAsync(ct);
    await db.Friendships
        .Where(f => f.User1Id == userId || f.User2Id == userId)
        .ExecuteDeleteAsync(ct);
    await db.UserBlocks
        .Where(b => b.BlockerId == userId || b.BlockedUserId == userId)
        .ExecuteDeleteAsync(ct);

    // Soft-delete preserves email + username to prevent re-registration (AGENT.md §6)
    user.DeletedAt = DateTime.UtcNow;
    await db.SaveChangesAsync(ct);

    // Revoke all sessions first so reconnect attempts are rejected
    await sessions.RevokeAllAsync(userId, ct: ct);

    // Broadcast ForceDisconnect to all active SignalR connections
    var connIds = await presence.GetConnectionIdsAsync(userId, ct);
    foreach (var connId in connIds)
        await presenceHub.Clients.Client(connId).SendAsync("ForceDisconnect", ct);

    return Results.NoContent();
}
```

The `group.MapDelete("/account", DeleteAccount)` registration at line 29 will automatically pick up the new parameters from ASP.NET Core DI — no change needed there.

- [ ] **Step 4: Run tests to confirm GREEN**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ --filter "FullyQualifiedName~AuthEndpointsTests" 2>&1 | tail -10
```

Expected:
```
Test Run Successful.
Total tests: 2
     Passed: 2
```

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ 2>&1 | tail -5
```

Expected: `Passed: 94` (was 92, +2 new tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add src/ChatHerder.API/Endpoints/AuthEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/AuthEndpointsTests.cs
git commit -m "feat: phase 4j — account deletion cascades owned rooms+files, broadcasts ForceDisconnect"
```

---

## Task 2: JoinDialog / LeaveDialog in PresenceHub

**Files:**
- Modify: `src/ChatHerder.API/Hubs/PresenceHub.cs`
- Modify: `tests/ChatHerder.Unit.Tests/Hubs/PresenceHubTests.cs`

**Context:** `ChatHub.SendDirectMessage` broadcasts to `Clients.Group($"dialog:{dialogId}")`, but no method currently adds connections to that group. Users never receive real-time DMs unless they're in the group. Fix: add `JoinDialog`/`LeaveDialog` to `PresenceHub` (which already holds `IHubContext<ChatHub>`), mirroring the existing `JoinRoom`/`LeaveRoom` pattern.

- [ ] **Step 1: Write failing tests**

Append these two tests to `tests/ChatHerder.Unit.Tests/Hubs/PresenceHubTests.cs` inside the `PresenceHubTests` class:

```csharp
[Fact]
public async Task JoinDialog_AddsConnectionToChatHubDialogGroup_ForParticipant()
{
    var userId  = Guid.NewGuid();
    var otherId = Guid.NewGuid();
    // User1Id < User2Id — sort them
    var (u1, u2) = userId.CompareTo(otherId) < 0 ? (userId, otherId) : (otherId, userId);

    var db = BuildDb();
    db.Users.AddRange(
        new User { Id = userId,  Username = "alice", Email = "a@x.com", PasswordHash = "x" },
        new User { Id = otherId, Username = "bob",   Email = "b@x.com", PasswordHash = "x" });
    var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
    db.PersonalDialogs.Add(dialog);
    await db.SaveChangesAsync();

    var store    = Substitute.For<IPresenceStore>();
    var chatGrps = Substitute.For<IGroupManager>();
    var chatCtx  = Substitute.For<IHubContext<ChatHub>>();
    chatCtx.Groups.Returns(chatGrps);

    var hub = new PresenceHub(store, chatCtx, db);
    var ctx = Substitute.For<HubCallerContext>();
    ctx.ConnectionId.Returns("conn-1");
    ctx.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
        new Claim("user_id",    userId.ToString()),
        new Claim("session_id", Guid.NewGuid().ToString()),
    ], "Test")));
    ctx.Items.Returns(new Dictionary<object, object?>());
    ctx.Features.Returns(Substitute.For<IFeatureCollection>());
    hub.Context = ctx;
    hub.Clients = Substitute.For<IHubCallerClients>();
    hub.Groups  = Substitute.For<IGroupManager>();

    await hub.JoinDialog(dialog.Id);

    await chatGrps.Received(1).AddToGroupAsync(
        "conn-1", $"dialog:{dialog.Id}", Arg.Any<CancellationToken>());
}

[Fact]
public async Task JoinDialog_DoesNotAddGroup_WhenNotParticipant()
{
    var userId = Guid.NewGuid();
    var db     = BuildDb();
    db.Users.Add(new User { Id = userId, Username = "carol", Email = "c@x.com", PasswordHash = "x" });
    // Dialog between two other users — userId is NOT a participant
    var dialog = new PersonalDialog { User1Id = Guid.NewGuid(), User2Id = Guid.NewGuid() };
    db.PersonalDialogs.Add(dialog);
    await db.SaveChangesAsync();

    var store    = Substitute.For<IPresenceStore>();
    var chatGrps = Substitute.For<IGroupManager>();
    var chatCtx  = Substitute.For<IHubContext<ChatHub>>();
    chatCtx.Groups.Returns(chatGrps);

    var hub = new PresenceHub(store, chatCtx, db);
    var ctx = Substitute.For<HubCallerContext>();
    ctx.ConnectionId.Returns("conn-1");
    ctx.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
        new Claim("user_id",    userId.ToString()),
        new Claim("session_id", Guid.NewGuid().ToString()),
    ], "Test")));
    ctx.Items.Returns(new Dictionary<object, object?>());
    ctx.Features.Returns(Substitute.For<IFeatureCollection>());
    hub.Context = ctx;
    hub.Clients = Substitute.For<IHubCallerClients>();
    hub.Groups  = Substitute.For<IGroupManager>();

    await hub.JoinDialog(dialog.Id);

    await chatGrps.DidNotReceive().AddToGroupAsync(
        Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
}
```

Also add the required using at the top of `PresenceHubTests.cs` if not present:
```csharp
using ChatHerder.Domain.Entities;
```
(This should already be there; verify.)

- [ ] **Step 2: Confirm tests fail (compile error — `JoinDialog` not defined)**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ --filter "JoinDialog" 2>&1 | tail -10
```

Expected: Build error — `PresenceHub` does not contain a definition for `JoinDialog`.

- [ ] **Step 3: Implement JoinDialog / LeaveDialog in PresenceHub.cs**

In `OnDisconnectedAsync`, after the room-cleanup block (after line 48), add dialog-group cleanup:

```csharp
if (Context.Items.TryGetValue("dialogs", out var dialogsObj) && dialogsObj is HashSet<Guid> dialogs)
{
    foreach (var dialogId in dialogs)
        await chatHub.Groups.RemoveFromGroupAsync(Context.ConnectionId, $"dialog:{dialogId}", ct);
}
```

After the existing `LeaveRoom` method (before `GetUserId()`), add:

```csharp
public async Task JoinDialog(Guid dialogId)
{
    var userId = GetUserId();
    var ct     = Context.ConnectionAborted;

    var isParticipant = await db.PersonalDialogs
        .AnyAsync(d => d.Id == dialogId && (d.User1Id == userId || d.User2Id == userId), ct);

    if (!isParticipant) return;

    await chatHub.Groups.AddToGroupAsync(Context.ConnectionId, $"dialog:{dialogId}", ct);

    if (!Context.Items.TryGetValue("dialogs", out var dialogsObj) || dialogsObj is not HashSet<Guid> dialogs)
    {
        dialogs = new HashSet<Guid>();
        Context.Items["dialogs"] = dialogs;
    }
    dialogs.Add(dialogId);
}

public async Task LeaveDialog(Guid dialogId)
{
    var ct = Context.ConnectionAborted;
    await chatHub.Groups.RemoveFromGroupAsync(Context.ConnectionId, $"dialog:{dialogId}", ct);

    if (Context.Items.TryGetValue("dialogs", out var dialogsObj) && dialogsObj is HashSet<Guid> dialogs)
        dialogs.Remove(dialogId);
}
```

- [ ] **Step 4: Run tests to confirm GREEN**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ --filter "JoinDialog" 2>&1 | tail -10
```

Expected:
```
Test Run Successful.
Total tests: 2
     Passed: 2
```

- [ ] **Step 5: Run full suite**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ 2>&1 | tail -5
```

Expected: `Passed: 96` (was 94 after Task 1, +2).

- [ ] **Step 6: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add src/ChatHerder.API/Hubs/PresenceHub.cs \
        tests/ChatHerder.Unit.Tests/Hubs/PresenceHubTests.cs
git commit -m "feat: add JoinDialog/LeaveDialog to PresenceHub for DM real-time delivery"
```

---

## Task 3: Angular — PresenceService joinDialog + DirectMessagesComponent

**Files:**
- Modify: `frontend/src/app/core/signalr/presence.service.ts`
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts`
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.spec.ts`

**Context:** `PresenceService` already has `joinRoom`/`leaveRoom` and `joinedRooms` set. Add the exact same pattern for dialogs. `DirectMessagesComponent.selectDialog()` must call these when the user picks a conversation.

- [ ] **Step 1: Write the failing test**

Read `frontend/src/app/features/dialogs/direct-messages/direct-messages.spec.ts` first (if it exists), then add or create with these tests:

```typescript
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { DirectMessagesComponent } from './direct-messages';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import type { DialogDto } from '../../../core/dialogs/dialogs.models';

const mockDialog = (id: string): DialogDto => ({
  id,
  otherUserId: 'other-1',
  otherUsername: 'Alice',
  otherAvatarUrl: null,
  isFrozen: false,
  createdAt: new Date().toISOString(),
});

function buildTestBed(presenceOverride?: Partial<{ joinDialog: ReturnType<typeof vi.fn>; leaveDialog: ReturnType<typeof vi.fn> }>) {
  const joinDialog  = presenceOverride?.joinDialog  ?? vi.fn().mockResolvedValue(undefined);
  const leaveDialog = presenceOverride?.leaveDialog ?? vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [DirectMessagesComponent],
    providers: [
      { provide: AuthSessionService,     useValue: { user: signal(null) } },
      { provide: DialogsApiService,      useValue: { getDialogs: () => of([]), getMessages: () => of([]) } },
      { provide: ChatService,            useValue: { lastDmEvent: signal(null) } },
      { provide: FilesApiService,        useValue: { uploadFile: () => of(), downloadFile: () => {} } },
      { provide: NotificationsApiService, useValue: { markDialogRead: () => of(void 0) } },
      { provide: UnreadService,          useValue: { setCount: vi.fn() } },
      { provide: PresenceService,        useValue: { joinDialog, leaveDialog } },
    ],
  });
  return { joinDialog, leaveDialog };
}

describe('DirectMessagesComponent', () => {
  it('should create', () => {
    buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('calls joinDialog when selecting a dialog', async () => {
    const { joinDialog } = buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    fixture.detectChanges();

    fixture.componentInstance.selectDialog(mockDialog('dialog-1'));

    expect(joinDialog).toHaveBeenCalledWith('dialog-1');
  });

  it('calls leaveDialog on previous dialog when switching', async () => {
    const { joinDialog, leaveDialog } = buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    fixture.detectChanges();

    fixture.componentInstance.selectDialog(mockDialog('dialog-1'));
    fixture.componentInstance.selectDialog(mockDialog('dialog-2'));

    expect(leaveDialog).toHaveBeenCalledWith('dialog-1');
    expect(joinDialog).toHaveBeenCalledWith('dialog-2');
  });
});
```

- [ ] **Step 2: Confirm test fails**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --watch=false 2>&1 | grep -E "FAIL|calls joinDialog|calls leaveDialog" | head -10
```

Expected: 2 tests fail (`calls joinDialog` / `calls leaveDialog`) because `PresenceService` isn't injected yet.

- [ ] **Step 3: Add joinDialog/leaveDialog to PresenceService**

In `frontend/src/app/core/signalr/presence.service.ts`:

After line `private readonly joinedRooms = new Set<string>();` add:
```typescript
private readonly joinedDialogs = new Set<string>();
```

After the existing `leaveRoom` method, add:
```typescript
async joinDialog(dialogId: string): Promise<void> {
  if (!this.connection) return;
  await this.connection.invoke('JoinDialog', dialogId);
  this.joinedDialogs.add(dialogId);
}

async leaveDialog(dialogId: string): Promise<void> {
  if (!this.connection) return;
  await this.connection.invoke('LeaveDialog', dialogId);
  this.joinedDialogs.delete(dialogId);
}
```

In `disconnect()`, after `this.joinedRooms.clear();` add:
```typescript
this.joinedDialogs.clear();
```

In `onreconnected` callback (currently: `this.connection.onreconnected(() => { this.rejoinAllRooms(); });`), update to:
```typescript
this.connection.onreconnected(() => {
  this.rejoinAllRooms();
  this.rejoinAllDialogs();
});
```

After `rejoinAllRooms()` method, add:
```typescript
private rejoinAllDialogs(): void {
  for (const dialogId of this.joinedDialogs) {
    void this.connection?.invoke('JoinDialog', dialogId);
  }
}
```

- [ ] **Step 4: Wire DirectMessagesComponent.selectDialog**

In `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts`:

Add `PresenceService` import and injection:
```typescript
import { PresenceService } from '../../../core/signalr/presence.service';
// inside class:
private readonly presence = inject(PresenceService);
```

Replace the existing `selectDialog` method:
```typescript
selectDialog(dialog: DialogDto): void {
  const prev = this.selectedDialog();
  if (prev) void this.presence.leaveDialog(prev.id);
  this.selectedDialog.set(dialog);
  void this.presence.joinDialog(dialog.id);
  this.loadMessages(dialog.id);
}
```

- [ ] **Step 5: Run Angular tests**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --watch=false 2>&1 | grep -E "Tests|failed|passed" | tail -5
```

Expected: All tests pass (was 109, now 112 — 3 new DM tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/core/signalr/presence.service.ts \
        frontend/src/app/features/dialogs/direct-messages/direct-messages.ts \
        frontend/src/app/features/dialogs/direct-messages/direct-messages.spec.ts
git commit -m "feat: joinDialog/leaveDialog in PresenceService; wire DirectMessagesComponent for real-time DM delivery"
```

---

## Task 4: E2E Message Selectors in room-chat.html

**Files:**
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.html`

**Context:** E2E tests assert `data-testid="message-{id}"` on individual messages and `data-testid="message-text"` on the text paragraph. These attributes are currently missing from the template. No new unit tests needed — this is a template-only change, covered by the E2E suite.

- [ ] **Step 1: Add data-testid to message wrapper div**

In `room-chat.html`, the `@for` block renders messages starting at (approx.) line 34:
```html
@for (msg of messages(); track msg.id) {
  <div class="flex gap-4 group">
```

Change the `<div>` to:
```html
@for (msg of messages(); track msg.id) {
  <div class="flex gap-4 group" [attr.data-testid]="'message-' + msg.id">
```

- [ ] **Step 2: Add data-testid to message-text paragraph**

Find the paragraph:
```html
<p class="text-sm text-on-surface leading-relaxed max-w-2xl">{{ msg.content }}</p>
```

Change to:
```html
<p class="text-sm text-on-surface leading-relaxed max-w-2xl" data-testid="message-text">{{ msg.content }}</p>
```

- [ ] **Step 3: Add data-testid to deleted-message paragraph**

Find:
```html
<p class="text-sm text-outline italic">Message deleted.</p>
```

Change to:
```html
<p class="text-sm text-outline italic" data-testid="message-deleted">Message deleted.</p>
```

- [ ] **Step 4: Run Angular tests to confirm no regressions**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --watch=false 2>&1 | grep -E "Tests|failed|passed" | tail -3
```

Expected: Same count as after Task 3 — all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/features/rooms/room-chat/room-chat.html
git commit -m "feat: add data-testid to room-chat message elements for E2E assertions"
```

---

## Task 5: DEVELOPMENT_LOG

**Files:**
- Modify: `DEVELOPMENT_LOG.md`

- [ ] **Step 1: Append log entries**

Append to `DEVELOPMENT_LOG.md` (check the last T-number first with `tail -5 DEVELOPMENT_LOG.md`, then use the next sequential number):

```
`[2026-04-19 T{N}]` | **[Phase 4j][Cloned agent 2] Account deletion cascade — owned rooms + files + ForceDisconnect** | TDD: wrote 2 failing tests (compile error — DeleteAccountInternal missing), implemented. DeleteAccount now: (1) for each owned room, loads attachment StoragePaths via join on Messages.RoomId, calls IFileStorage.DeleteAsync per path, ExecuteDeletes Attachments/Messages/RoomBans/RoomInvitations/RoomMemberships, then bulk-deletes Rooms; (2) calls IPresenceStore.GetConnectionIdsAsync and sends ForceDisconnect to each via IHubContext<PresenceHub>.Clients.Client(connId). Added internal DeleteAccountInternal bridge method following FilesEndpoints pattern. 2/2 tests GREEN; full suite 94/94. | Files: AuthEndpoints.cs, AuthEndpointsTests.cs. | **[BUILD]**

`[2026-04-19 T{N+1}]` | **[Phase 4j][Cloned agent 2] JoinDialog/LeaveDialog in PresenceHub — fix DM real-time delivery** | TDD: wrote 2 failing tests, implemented. DMs were broken: ChatHub broadcasts to `dialog:{id}` group but no method existed to add connections to that group. Added JoinDialog (verifies participant via PersonalDialogs query, adds connection to chatHub.Groups `dialog:{id}`, tracks in Context.Items["dialogs"]) and LeaveDialog (removes from chatHub.Groups, cleans set). OnDisconnectedAsync now also sweeps dialog groups on disconnect. 2/2 tests GREEN; full suite 96/96. | Files: PresenceHub.cs, PresenceHubTests.cs. | **[BUILD]**

`[2026-04-19 T{N+2}]` | **[Angular][Cloned agent 2] PresenceService joinDialog/leaveDialog + DirectMessagesComponent wiring** | TDD: wrote 3 failing Angular tests, implemented. Added joinDialog/leaveDialog/rejoinAllDialogs to PresenceService (mirrors joinRoom/leaveRoom/rejoinAllRooms pattern); joinedDialogs set cleared on disconnect; onreconnected calls rejoinAllDialogs. DirectMessagesComponent.selectDialog() now calls presence.leaveDialog(prev.id) before switching and presence.joinDialog(dialog.id) on new selection. 3 new tests GREEN; full frontend suite 112/112. | Files: presence.service.ts, direct-messages.ts, direct-messages.spec.ts. | **[BUILD]**

`[2026-04-19 T{N+3}]` | **[E2E][Cloned agent 2] Add data-testid to room-chat message elements** | Added [attr.data-testid]="'message-' + msg.id" to message wrapper div, data-testid="message-text" to message content paragraph, data-testid="message-deleted" to soft-deleted message paragraph in room-chat.html. Unblocks 4 E2E latency and delete-state assertions. No unit test changes; all existing tests still pass. | Files: room-chat.html. | **[BUILD]**
```

- [ ] **Step 2: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add DEVELOPMENT_LOG.md
git commit -m "docs: log T{N}–T{N+3} phase 4j completion and remaining gap fixes"
```

---

## Self-Review

**1. Spec coverage:**
- Account deletion cascade (owned rooms + files) ✅ Task 1
- ForceDisconnect on account delete ✅ Task 1
- DM real-time delivery (JoinDialog backend) ✅ Task 2
- DM real-time delivery (Angular PresenceService + component) ✅ Task 3
- E2E message selectors ✅ Task 4
- DEVELOPMENT_LOG ✅ Task 5

**2. Placeholder scan:** No TBD/TODO/placeholder text present. All steps contain actual code.

**3. Type consistency:**
- `Attachment.UploadedByUserId` (not UploaderUserId) ✅ verified from entity
- `Attachment.SizeBytes` (not FileSize) ✅ verified from entity
- `Message.AuthorId` (not SenderId) ✅ verified from entity
- `PersonalDialog.User1Id < User2Id` — test enforces ordering with `CompareTo` ✅
- `PresenceService.joinDialog` / `leaveDialog` match hub method names `JoinDialog` / `LeaveDialog` ✅
- `DirectMessagesComponent.selectDialog` signature unchanged (still takes `DialogDto`) ✅
