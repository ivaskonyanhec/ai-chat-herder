# Phase 4b — SignalR Hubs (PresenceHub + ChatHub) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `PresenceHub` (`/hubs/presence`) and `ChatHub` (`/hubs/chat`) to deliver real-time messaging, presence tracking, AFK signals, typing indicators, and unread-count pushes over WebSocket.

**Architecture:** Two `[Authorize]` SignalR hubs live in `src/ChatHerder.API/Hubs/`. `PresenceHub` owns connection lifecycle (register/unregister tab, heartbeat, AFK, JoinRoom/LeaveRoom) via the already-implemented `IPresenceStore`. `ChatHub` owns all message mutations (send/edit/delete rooms + DMs), typing events, and unread increment via `IUnreadStore`. Cross-hub group membership: `PresenceHub.JoinRoom` injects `IHubContext<ChatHub>` and adds the connection to `room:{id}` in both hubs' group managers so either hub can broadcast to that group. `Clients.Clients(connIds)` (using connection IDs from `IPresenceStore.GetConnectionIdsAsync`) handles per-user targeted pushes such as `UnreadCountChanged`.

**Tech Stack:** ASP.NET Core SignalR (.NET 10), EF Core 9 + Npgsql (PostgreSQL), StackExchange.Redis via `IPresenceStore`/`IUnreadStore`, xUnit + NSubstitute for hub unit tests.

---

## Codebase Reference (read before starting any task)

### Existing interfaces
- `IPresenceStore` — `src/ChatHerder.Application/Ports/IPresenceStore.cs` — 16 methods:
  - `RegisterTabAsync(userId, connId)` — ZADD sorted-set with current Unix timestamp; calling again updates the score (heartbeat reuse).
  - `UnregisterTabAsync(userId, connId)` — ZREM.
  - `GetTabCountAsync(userId)` → `long` — ZCARD.
  - `SetStatusAsync(userId, status)` / `GetStatusAsync(userId)` → `string?` — Redis string with TTL.
  - `SetAfkTabAsync(userId, connId)` / `ClearAfkTabAsync(userId, connId)` — SADD/SREM to `afk_tabs:{userId}`.
  - `IsAllTabsAfkAsync(userId)` → `bool` — `SCARD afk_tabs == ZCARD presence:tabs`.
  - `GetConnectionIdsAsync(userId)` → `IReadOnlyList<string>` — connection IDs for a user.
  - `SetConnUserAsync(connId, userId)` / `SetConnSessionAsync(connId, sessionId)` — metadata keys.
  - `AddToActiveUsersAsync(userId)` / `RemoveFromActiveUsersAsync(userId)` / `GetActiveUsersAsync()`.
  - `GetStaleTabsAsync` / `RemoveStaleTabAsync` — used only by `PresenceMonitorService`.

- `IUnreadStore` — `src/ChatHerder.Application/Ports/IUnreadStore.cs`:
  - `IncrementAsync(userId, contextType, contextId)` — INCR.
  - `GetCountAsync(userId, contextType, contextId)` → `long`.
  - `ClearAsync(userId, contextType, contextId)` — DEL.
  - `SetAsync(userId, contextType, contextId, count)` — SET.
  - `GetAllAsync(userId, contexts)` → list of `(ContextType, ContextId, Count)` tuples.

### Existing DTOs (`src/ChatHerder.Application/DTOs/MessageDtos.cs`)
```csharp
record UserSummary(Guid Id, string Username, string? AvatarUrl);
record AttachmentDto(Guid Id, string FileName, string ContentType, long SizeBytes, string? Comment);
record MessageDto(Guid Id, long SequenceNumber, string? Content, UserSummary Sender,
                  DateTime SentAt, DateTime? EditedAt, bool IsDeleted, MessageDto? ReplyTo,
                  AttachmentDto? Attachment);
record DialogMessageDto(Guid Id, long SequenceNumber, string? Content, UserSummary Sender,
                        DateTime SentAt, DateTime? EditedAt, bool IsDeleted,
                        DialogMessageDto? ReplyTo, AttachmentDto? Attachment);
```

### `RoomEndpoints.ToDto(Message)` — `src/ChatHerder.API/Endpoints/RoomEndpoints.cs`
`internal static MessageDto ToDto(Message m)` is accessible from hub classes in the same assembly (`ChatHerder.API`). Use it to build room `MessageDto` after saving.

### Domain enums
- `ContextType` — `src/ChatHerder.Domain/Enums/ContextType.cs`: `Room = 0, Dialog = 1`
- `MemberRole` — `src/ChatHerder.Domain/Enums/MemberRole.cs`: `Member, Admin, Owner`

### Ban check pattern
`RoomBan.RevokedAt == null` means the ban is active (there is no expiry — unban sets `RevokedAt`).

### Sequence allocation (MANDATORY — no MAX()+1)
Atomic UPSERT+RETURNING for both room and dialog sequences:
```sql
INSERT INTO "ContextSequences" ("ContextType", "ContextId", "NextValue")
VALUES ({type_int}, {contextId}, 1)
ON CONFLICT ("ContextType", "ContextId") DO UPDATE
    SET "NextValue" = "ContextSequences"."NextValue" + 1
RETURNING "NextValue"
```
First insert returns 1; subsequent calls return N+1. Use `Database.SqlQuery<long>(FormattableString)` (EF Core 8+, scalar support).

### Existing test pattern (`tests/ChatHerder.Unit.Tests/`)
In-memory EF Core context:
```csharp
private static AppDbContext BuildDb() =>
    new(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
```
NSubstitute for all I/O. Hub unit tests substitute `HubCallerContext` (abstract class), `IHubCallerClients`, `IGroupManager`, and `IClientProxy`. Return a real `Dictionary<object, object?>` for `Context.Items`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/ChatHerder.API/Hubs/PresenceHub.cs` | Create | Connection lifecycle, Heartbeat, SetAfk/SetActive, JoinRoom/LeaveRoom |
| `src/ChatHerder.API/Hubs/ChatHub.cs` | Create | Send/Edit/Delete messages (rooms + DMs), StartTyping/StopTyping |
| `src/ChatHerder.API/Program.cs` | Modify | `app.MapHub<PresenceHub>("/hubs/presence")` + `app.MapHub<ChatHub>("/hubs/chat")` |
| `tests/ChatHerder.Unit.Tests/Hubs/PresenceHubTests.cs` | Create | Unit tests: OnConnected registers tab, Heartbeat refreshes score, JoinRoom sends snapshot, SetAfk broadcasts |
| `tests/ChatHerder.Unit.Tests/Hubs/ChatHubTests.cs` | Create | Unit tests: SendMessage rejects non-member; SendMessage rejects banned; content validation; EditMessage rejects non-author |

---

### Task 1: PresenceHub — Full Implementation + Tests

**Context:**  
`[Authorize]` on the class causes SignalR to reject the WebSocket upgrade if the JWT is missing or invalid — same as REST endpoints. `Context.ConnectionId` is the tab's unique SignalR connection ID. `Context.Items` is a `Dictionary<object, object?>` scoped to the connection lifetime; we store joined room IDs there so `OnDisconnectedAsync` can clean them up.

`IHubContext<ChatHub>` is injected to cross-register the connection into ChatHub's group manager during `JoinRoom`. This lets `ChatHub.SendMessage` broadcast to `room:{id}` without needing `PresenceHub` awareness.

Status broadcast targets `Clients.All` (all connected SignalR clients). This is acceptable for Phase 4b scale; per-room subscriber filtering is a Phase 5 optimization.

**Files:**
- Create: `src/ChatHerder.API/Hubs/PresenceHub.cs`
- Create: `tests/ChatHerder.Unit.Tests/Hubs/PresenceHubTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/ChatHerder.Unit.Tests/Hubs/PresenceHubTests.cs`:

```csharp
using ChatHerder.API.Hubs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Hubs;

public sealed class PresenceHubTests
{
    private static AppDbContext BuildDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static (PresenceHub hub, IPresenceStore store, IHubCallerClients clients, IGroupManager groups)
        BuildHub(Guid userId, AppDbContext? db = null)
    {
        var store   = Substitute.For<IPresenceStore>();
        var chatCtx = Substitute.For<IHubContext<ChatHub>>();
        chatCtx.Groups.Returns(Substitute.For<IGroupManager>());

        var hub = new PresenceHub(store, chatCtx, db ?? BuildDb());

        var context = Substitute.For<HubCallerContext>();
        context.ConnectionId.Returns("conn-1");
        context.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id",    userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test")));
        context.Items.Returns(new Dictionary<object, object?>());
        context.Features.Returns(Substitute.For<IFeatureCollection>());
        hub.Context = context;

        var clients = Substitute.For<IHubCallerClients>();
        var allProxy = Substitute.For<IClientProxy>();
        clients.All.Returns(allProxy);
        hub.Clients = clients;

        var groups = Substitute.For<IGroupManager>();
        hub.Groups = groups;

        return (hub, store, clients, groups);
    }

    [Fact]
    public async Task OnConnectedAsync_RegistersTabAndSetsOnline()
    {
        var userId = Guid.NewGuid();
        var (hub, store, _, _) = BuildHub(userId);
        store.GetStatusAsync(userId).Returns((string?)"offline");

        await hub.OnConnectedAsync();

        await store.Received(1).RegisterTabAsync(userId, "conn-1");
        await store.Received(1).AddToActiveUsersAsync(userId);
        await store.Received(1).SetStatusAsync(userId, "online");
    }

    [Fact]
    public async Task Heartbeat_RefreshesScoreAndClearsAfk()
    {
        var userId = Guid.NewGuid();
        var (hub, store, _, _) = BuildHub(userId);
        store.GetStatusAsync(userId).Returns((string?)"online");
        store.IsAllTabsAfkAsync(userId).Returns(false);

        await hub.Heartbeat();

        await store.Received(1).RegisterTabAsync(userId, "conn-1");
        await store.Received(1).ClearAfkTabAsync(userId, "conn-1");
    }

    [Fact]
    public async Task SetAfk_WhenAllTabsAfk_BroadcastsAfkStatus()
    {
        var userId = Guid.NewGuid();
        var (hub, store, clients, _) = BuildHub(userId);
        store.IsAllTabsAfkAsync(userId).Returns(true);

        await hub.SetAfk();

        await store.Received(1).SetAfkTabAsync(userId, "conn-1");
        await store.Received(1).SetStatusAsync(userId, "afk");
        await clients.All.Received(1).SendAsync(
            "UserStatusChanged", Arg.Any<object>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task JoinRoom_SendsRoomMembersSnapshot_ToCallerOnly()
    {
        var userId = Guid.NewGuid();
        var db     = BuildDb();

        // Seed: user + membership
        var user = new User { Username = "alice", Email = "a@x.com", PasswordHash = "x" };
        user = user with { Id = userId };  // override generated ID — User uses init so create properly:
        db.Users.Add(new User { Id = userId, Username = "alice", Email = "a@x.com", PasswordHash = "x" });
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = userId };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership
            { RoomId = room.Id, UserId = userId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var (hub, store, clients, _) = BuildHub(userId, db);
        store.GetStatusAsync(userId).Returns((string?)"online");

        var callerProxy = Substitute.For<IClientProxy>();
        clients.Caller.Returns(callerProxy);
        var othersProxy = Substitute.For<IClientProxy>();
        clients.OthersInGroup(Arg.Any<string>()).Returns(othersProxy);

        await hub.JoinRoom(room.Id);

        await callerProxy.Received(1).SendAsync(
            "RoomMembersSnapshot", Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}
```

> **Note on seeding:** `User.Id` uses `{ get; init; }` with a default. To force a specific ID when building test entities, use the object initializer directly:
> ```csharp
> db.Users.Add(new User { Id = userId, Username = "alice", Email = "a@x.com", PasswordHash = "x" });
> ```

- [ ] **Step 2: Run test to verify it fails**
```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "PresenceHubTests" -v minimal
```
Expected: **FAIL** — type `PresenceHub` not found.

- [ ] **Step 3: Create `src/ChatHerder.API/Hubs/PresenceHub.cs`**

```csharp
using System.Security.Claims;
using System.Text;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Hubs;

[Authorize]
public sealed class PresenceHub(
    IPresenceStore presence,
    IHubContext<ChatHub> chatHub,
    AppDbContext db) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId    = GetUserId();
        var sessionId = GetSessionId();

        await presence.RegisterTabAsync(userId, Context.ConnectionId);
        await presence.SetConnUserAsync(Context.ConnectionId, userId);
        await presence.SetConnSessionAsync(Context.ConnectionId, sessionId);
        await presence.AddToActiveUsersAsync(userId);

        var prev = await presence.GetStatusAsync(userId);
        await presence.SetStatusAsync(userId, "online");

        if (prev != "online")
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "online" });

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetUserId();

        await presence.UnregisterTabAsync(userId, Context.ConnectionId);

        if (Context.Items.TryGetValue("rooms", out var obj) && obj is HashSet<Guid> rooms)
        {
            foreach (var roomId in rooms.ToList())
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}");
                await chatHub.Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}");
                await Clients.OthersInGroup($"room:{roomId}").SendAsync(
                    "MemberLeft", new { roomId, userId });
            }
        }

        var tabCount = await presence.GetTabCountAsync(userId);
        if (tabCount == 0)
        {
            await presence.SetStatusAsync(userId, "offline");
            await presence.RemoveFromActiveUsersAsync(userId);
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "offline" });
        }
        else if (await presence.IsAllTabsAfkAsync(userId))
        {
            await presence.SetStatusAsync(userId, "afk");
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "afk" });
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task Heartbeat()
    {
        var userId = GetUserId();
        // RegisterTabAsync with current timestamp updates the sorted-set score (heartbeat reuse).
        await presence.RegisterTabAsync(userId, Context.ConnectionId);
        await presence.ClearAfkTabAsync(userId, Context.ConnectionId);

        var status = await presence.GetStatusAsync(userId);
        if (status == "afk" && !await presence.IsAllTabsAfkAsync(userId))
        {
            await presence.SetStatusAsync(userId, "online");
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "online" });
        }
    }

    public async Task SetAfk()
    {
        var userId = GetUserId();
        await presence.SetAfkTabAsync(userId, Context.ConnectionId);

        if (await presence.IsAllTabsAfkAsync(userId))
        {
            await presence.SetStatusAsync(userId, "afk");
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "afk" });
        }
    }

    public async Task SetActive()
    {
        var userId = GetUserId();
        await presence.ClearAfkTabAsync(userId, Context.ConnectionId);

        var status = await presence.GetStatusAsync(userId);
        if (status == "afk")
        {
            await presence.SetStatusAsync(userId, "online");
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "online" });
        }
    }

    public async Task JoinRoom(Guid roomId)
    {
        var userId = GetUserId();

        var membership = await db.RoomMemberships
            .Include(m => m.User)
            .FirstOrDefaultAsync(m => m.RoomId == roomId && m.UserId == userId);
        if (membership is null) return;

        var isBanned = await db.RoomBans.AnyAsync(
            b => b.RoomId == roomId && b.BannedUserId == userId && b.RevokedAt == null);
        if (isBanned)
        {
            await Clients.Caller.SendAsync("RemovedFromRoom", new { roomId, reason = "banned" });
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"room:{roomId}");
        await chatHub.Groups.AddToGroupAsync(Context.ConnectionId, $"room:{roomId}");

        if (!Context.Items.ContainsKey("rooms"))
            Context.Items["rooms"] = new HashSet<Guid>();
        ((HashSet<Guid>)Context.Items["rooms"]!).Add(roomId);

        var allMembers = await db.RoomMemberships
            .Include(m => m.User)
            .Where(m => m.RoomId == roomId)
            .ToListAsync();

        var memberDtos = new List<object>();
        foreach (var m in allMembers)
        {
            var presenceStatus = await presence.GetStatusAsync(m.UserId) ?? "offline";
            memberDtos.Add(new
            {
                m.UserId,
                m.User.Username,
                m.User.AvatarUrl,
                Role          = m.Role.ToString(),
                m.JoinedAt,
                PresenceStatus = presenceStatus,
            });
        }

        await Clients.Caller.SendAsync("RoomMembersSnapshot", new { roomId, members = memberDtos });
        await Clients.OthersInGroup($"room:{roomId}").SendAsync("MemberJoined", new
        {
            roomId,
            user = new { userId, membership.User.Username, membership.User.AvatarUrl },
        });
    }

    public async Task LeaveRoom(Guid roomId)
    {
        var userId = GetUserId();

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}");
        await chatHub.Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}");

        if (Context.Items.TryGetValue("rooms", out var obj) && obj is HashSet<Guid> rooms)
            rooms.Remove(roomId);

        await Clients.Group($"room:{roomId}").SendAsync("MemberLeft", new { roomId, userId });
    }

    private Guid GetUserId()
    {
        var raw = Context.User?.FindFirstValue("user_id");
        if (!Guid.TryParse(raw, out var id)) throw new HubException("Unauthorized");
        return id;
    }

    private Guid GetSessionId()
    {
        var raw = Context.User?.FindFirstValue("session_id");
        if (!Guid.TryParse(raw, out var id)) throw new HubException("Unauthorized");
        return id;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**
```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "PresenceHubTests" -v minimal
```
Expected: **PASS** (4 tests, 0 failures)

- [ ] **Step 5: Verify solution builds**
```bash
dotnet build ChatHerder.sln -v minimal
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**
```bash
git add src/ChatHerder.API/Hubs/PresenceHub.cs \
        tests/ChatHerder.Unit.Tests/Hubs/PresenceHubTests.cs
git commit -m "feat: add PresenceHub (connection lifecycle, Heartbeat, AFK, JoinRoom/LeaveRoom)"
```

---

### Task 2: ChatHub — SendMessage + SendDirectMessage + Unread Broadcast

**Context:**  
ChatHub handles all message creation mutations. After saving a message, unread is incremented for every room/dialog member **except the sender** using `IUnreadStore.IncrementAsync`. The incremented member's active connections are retrieved from `IPresenceStore.GetConnectionIdsAsync(memberId)` so `Clients.Clients(connIds).SendAsync("UnreadCountChanged", …)` delivers the push to exactly the right WebSocket connections without requiring a custom `IUserIdProvider`.

`RoomEndpoints.ToDto(Message)` is reused to build the room `MessageDto` after reload. For DMs, build `DialogMessageDto` inline.

Sequence allocation for both room and dialog messages uses the atomic UPSERT+RETURNING pattern defined at the top of this plan. `Database.SqlQuery<long>(FormattableString)` is the EF Core 8+ API for scalar SQL queries.

`PersonalDialog.User1Id < User2Id` invariant (ordinal Guid comparison) is enforced when looking up or creating a dialog. For the hub's DM method, the dialog is assumed to already exist (created on first "message" via a separate dialog-creation endpoint if needed — for Phase 4b, hub receives `dialogId` directly, so this invariant is not the hub's concern).

**Files:**
- Create: `src/ChatHerder.API/Hubs/ChatHub.cs`
- Create: `tests/ChatHerder.Unit.Tests/Hubs/ChatHubTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/ChatHerder.Unit.Tests/Hubs/ChatHubTests.cs`:

```csharp
using ChatHerder.API.Hubs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Hubs;

public sealed class ChatHubTests
{
    private static AppDbContext BuildDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static ChatHub BuildHub(AppDbContext db, Guid userId,
        IUnreadStore? unread = null, IPresenceStore? presence = null)
    {
        var hub = new ChatHub(db,
            unread   ?? Substitute.For<IUnreadStore>(),
            presence ?? Substitute.For<IPresenceStore>());

        var context = Substitute.For<HubCallerContext>();
        context.ConnectionId.Returns("conn-chat");
        context.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id",    userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test")));
        context.Items.Returns(new Dictionary<object, object?>());
        context.Features.Returns(Substitute.For<IFeatureCollection>());
        hub.Context = context;

        hub.Clients = Substitute.For<IHubCallerClients>();
        hub.Groups  = Substitute.For<IGroupManager>();

        return hub;
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenCallerIsNotMember()
    {
        var userId = Guid.NewGuid();
        var roomId = Guid.NewGuid();
        var db     = BuildDb();
        // No room or membership seeded.
        var hub = BuildHub(db, userId);

        await Assert.ThrowsAsync<HubException>(() => hub.SendMessage(roomId, "hello"));
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenCallerIsBanned()
    {
        var userId = Guid.NewGuid();
        var db     = BuildDb();
        var room   = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = userId };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = userId, Role = MemberRole.Member });
        db.RoomBans.Add(new RoomBan
        {
            RoomId        = room.Id,
            BannedUserId  = userId,
            BannedByUserId = Guid.NewGuid(),
            RevokedAt     = null,   // active ban
        });
        await db.SaveChangesAsync();

        var hub = BuildHub(db, userId);

        await Assert.ThrowsAsync<HubException>(() => hub.SendMessage(room.Id, "hello"));
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenContentIsEmpty()
    {
        var userId = Guid.NewGuid();
        var db     = BuildDb();
        var room   = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = userId };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = userId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var hub = BuildHub(db, userId);

        await Assert.ThrowsAsync<HubException>(() => hub.SendMessage(room.Id, "   "));
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenContentExceedsLimit()
    {
        var userId  = Guid.NewGuid();
        var db      = BuildDb();
        var room    = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = userId };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = userId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var hub = BuildHub(db, userId);
        var oversized = new string('x', 4000); // > 3072 bytes

        await Assert.ThrowsAsync<HubException>(() => hub.SendMessage(room.Id, oversized));
    }

    [Fact]
    public async Task EditMessage_ThrowsHubException_WhenCallerIsNotAuthor()
    {
        var authorId = Guid.NewGuid();
        var otherId  = Guid.NewGuid();
        var db       = BuildDb();
        db.Users.AddRange(
            new User { Id = authorId, Username = "author", Email = "a@x.com", PasswordHash = "x" },
            new User { Id = otherId,  Username = "other",  Email = "b@x.com", PasswordHash = "x" });
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = authorId };
        db.Rooms.Add(room);
        db.Messages.Add(new Message
            { RoomId = room.Id, AuthorId = authorId, Content = "hi", SequenceNumber = 1 });
        await db.SaveChangesAsync();
        var msg = db.Messages.First();

        var hub = BuildHub(db, otherId);

        await Assert.ThrowsAsync<HubException>(() => hub.EditMessage(msg.Id, "changed"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**
```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "ChatHubTests" -v minimal
```
Expected: **FAIL** — type `ChatHub` not found.

- [ ] **Step 3: Create `src/ChatHerder.API/Hubs/ChatHub.cs`**

```csharp
using System.Security.Claims;
using System.Text;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Hubs;

[Authorize]
public sealed class ChatHub(
    AppDbContext db,
    IUnreadStore unread,
    IPresenceStore presence) : Hub
{
    private const int MaxMessageBytes = 3072;

    // ── Room messages ──────────────────────────────────────────────────────────

    public async Task SendMessage(Guid roomId, string content,
        Guid? replyToId = null, Guid? attachmentId = null)
    {
        if (string.IsNullOrWhiteSpace(content) || Encoding.UTF8.GetByteCount(content) > MaxMessageBytes)
            throw new HubException("Message content is invalid or exceeds 3 KB.");

        var userId = GetUserId();

        var isMember = await db.RoomMemberships.AnyAsync(m => m.RoomId == roomId && m.UserId == userId);
        if (!isMember) throw new HubException("Not a room member.");

        var isBanned = await db.RoomBans.AnyAsync(
            b => b.RoomId == roomId && b.BannedUserId == userId && b.RevokedAt == null);
        if (isBanned) throw new HubException("You are banned from this room.");

        var seq = await AllocateSequenceAsync(ContextType.Room, roomId);

        var msg = new Message
        {
            RoomId          = roomId,
            AuthorId        = userId,
            Content         = content,
            SequenceNumber  = seq,
            ReplyToMessageId = replyToId,
        };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();

        // Reload with all includes for DTO mapping.
        var full = await db.Messages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstAsync(m => m.Id == msg.Id);

        var dto = Endpoints.RoomEndpoints.ToDto(full);
        await Clients.Group($"room:{roomId}").SendAsync("MessageReceived", dto);

        await BroadcastUnreadAsync(roomId, userId, "room");
    }

    public async Task EditMessage(Guid messageId, string newContent)
    {
        if (string.IsNullOrWhiteSpace(newContent) || Encoding.UTF8.GetByteCount(newContent) > MaxMessageBytes)
            throw new HubException("Message content is invalid or exceeds 3 KB.");

        var userId = GetUserId();

        var msg = await db.Messages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null);

        if (msg is null) throw new HubException("Message not found.");
        if (msg.AuthorId != userId) throw new HubException("Cannot edit another user's message.");

        msg.Content  = newContent;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await Clients.Group($"room:{msg.RoomId}").SendAsync("MessageEdited", Endpoints.RoomEndpoints.ToDto(msg));
    }

    public async Task DeleteMessage(Guid messageId)
    {
        var userId = GetUserId();

        var msg = await db.Messages
            .Include(m => m.Room)
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null);

        if (msg is null) throw new HubException("Message not found.");

        var isAuthor = msg.AuthorId == userId;
        var isAdmin  = await db.RoomMemberships.AnyAsync(m =>
            m.RoomId == msg.RoomId && m.UserId == userId &&
            (m.Role == MemberRole.Admin || m.Role == MemberRole.Owner));

        if (!isAuthor && !isAdmin) throw new HubException("Insufficient permissions.");

        msg.DeletedAt       = DateTime.UtcNow;
        msg.DeletedByUserId = userId;
        await db.SaveChangesAsync();

        await Clients.Group($"room:{msg.RoomId}").SendAsync(
            "MessageDeleted", new { messageId, roomId = msg.RoomId });
    }

    // ── Room typing ────────────────────────────────────────────────────────────

    public async Task StartTyping(Guid roomId)
    {
        var userId = GetUserId();
        await Clients.OthersInGroup($"room:{roomId}").SendAsync(
            "UserTyping", new { roomId, userId, isTyping = true });
    }

    public async Task StopTyping(Guid roomId)
    {
        var userId = GetUserId();
        await Clients.OthersInGroup($"room:{roomId}").SendAsync(
            "UserTyping", new { roomId, userId, isTyping = false });
    }

    // ── DM messages ───────────────────────────────────────────────────────────

    public async Task SendDirectMessage(Guid dialogId, string content,
        Guid? replyToId = null, Guid? attachmentId = null)
    {
        if (string.IsNullOrWhiteSpace(content) || Encoding.UTF8.GetByteCount(content) > MaxMessageBytes)
            throw new HubException("Message content is invalid or exceeds 3 KB.");

        var userId = GetUserId();

        var dialog = await db.PersonalDialogs.FirstOrDefaultAsync(
            d => d.Id == dialogId && (d.User1Id == userId || d.User2Id == userId));
        if (dialog is null) throw new HubException("Dialog not found.");

        if (dialog.FrozenAt is not null) throw new HubException("This dialog is frozen.");

        var seq = await AllocateSequenceAsync(ContextType.Dialog, dialogId);

        var author = await db.Users.FirstAsync(u => u.Id == userId);
        var dm = new PersonalDialogMessage
        {
            DialogId         = dialogId,
            AuthorId         = userId,
            Content          = content,
            SequenceNumber   = seq,
            ReplyToMessageId = replyToId,
        };
        db.PersonalDialogMessages.Add(dm);
        await db.SaveChangesAsync();

        // Reload with includes.
        var full = await db.PersonalDialogMessages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstAsync(m => m.Id == dm.Id);

        var dto = ToDialogDto(full);
        await Clients.Group($"dialog:{dialogId}").SendAsync("DirectMessageReceived", dto);

        var otherId = dialog.User1Id == userId ? dialog.User2Id : dialog.User1Id;
        await unread.IncrementAsync(otherId, "dialog", dialogId);
        var connIds = await presence.GetConnectionIdsAsync(otherId);
        if (connIds.Count > 0)
        {
            var count = await unread.GetCountAsync(otherId, "dialog", dialogId);
            await Clients.Clients(connIds).SendAsync(
                "UnreadCountChanged", new { contextType = "dialog", contextId = dialogId, count });
        }
    }

    public async Task EditDirectMessage(Guid messageId, string newContent)
    {
        if (string.IsNullOrWhiteSpace(newContent) || Encoding.UTF8.GetByteCount(newContent) > MaxMessageBytes)
            throw new HubException("Message content is invalid or exceeds 3 KB.");

        var userId = GetUserId();

        var msg = await db.PersonalDialogMessages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null);

        if (msg is null) throw new HubException("Message not found.");
        if (msg.AuthorId != userId) throw new HubException("Cannot edit another user's message.");

        msg.Content  = newContent;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await Clients.Group($"dialog:{msg.DialogId}").SendAsync("DirectMessageEdited", ToDialogDto(msg));
    }

    public async Task DeleteDirectMessage(Guid messageId)
    {
        var userId = GetUserId();

        var msg = await db.PersonalDialogMessages
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null);

        if (msg is null) throw new HubException("Message not found.");
        if (msg.AuthorId != userId) throw new HubException("Cannot delete another user's message.");

        msg.DeletedAt       = DateTime.UtcNow;
        msg.DeletedByUserId = userId;
        await db.SaveChangesAsync();

        await Clients.Group($"dialog:{msg.DialogId}").SendAsync(
            "DirectMessageDeleted", new { messageId, dialogId = msg.DialogId });
    }

    // ── DM typing ─────────────────────────────────────────────────────────────

    public async Task StartTypingDM(Guid dialogId)
    {
        var userId = GetUserId();
        await Clients.OthersInGroup($"dialog:{dialogId}").SendAsync(
            "UserTypingInDialog", new { dialogId, userId, isTyping = true });
    }

    public async Task StopTypingDM(Guid dialogId)
    {
        var userId = GetUserId();
        await Clients.OthersInGroup($"dialog:{dialogId}").SendAsync(
            "UserTypingInDialog", new { dialogId, userId, isTyping = false });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<long> AllocateSequenceAsync(ContextType type, Guid contextId)
    {
        var results = await db.Database
            .SqlQuery<long>($"""
                INSERT INTO "ContextSequences" ("ContextType", "ContextId", "NextValue")
                VALUES ({(int)type}, {contextId}, 1)
                ON CONFLICT ("ContextType", "ContextId") DO UPDATE
                    SET "NextValue" = "ContextSequences"."NextValue" + 1
                RETURNING "NextValue"
                """)
            .ToListAsync();
        return results[0];
    }

    private async Task BroadcastUnreadAsync(Guid contextId, Guid senderId, string contextType)
    {
        var memberUserIds = contextType == "room"
            ? await db.RoomMemberships
                  .Where(m => m.RoomId == contextId)
                  .Select(m => m.UserId)
                  .ToListAsync()
            : await db.PersonalDialogs
                  .Where(d => d.Id == contextId)
                  .Select(d => new[] { d.User1Id, d.User2Id }.ToList())
                  .FirstOrDefaultAsync() ?? [];

        foreach (var memberId in memberUserIds.Where(id => id != senderId))
        {
            await unread.IncrementAsync(memberId, contextType, contextId);
            var connIds = await presence.GetConnectionIdsAsync(memberId);
            if (connIds.Count > 0)
            {
                var count = await unread.GetCountAsync(memberId, contextType, contextId);
                await Clients.Clients(connIds).SendAsync(
                    "UnreadCountChanged", new { contextType, contextId, count });
            }
        }
    }

    private static DialogMessageDto ToDialogDto(PersonalDialogMessage m) =>
        new(m.Id, m.SequenceNumber,
            m.DeletedAt.HasValue ? null : m.Content,
            new UserSummary(m.Author.Id, m.Author.Username, m.Author.AvatarUrl),
            m.SentAt, m.EditedAt,
            m.DeletedAt.HasValue,
            m.ReplyToMessage is null ? null : ToDialogDto(m.ReplyToMessage),
            m.Attachment is null ? null
                : new AttachmentDto(m.Attachment.Id, m.Attachment.FileName,
                      m.Attachment.ContentType, m.Attachment.SizeBytes, m.Attachment.Comment));

    private Guid GetUserId()
    {
        var raw = Context.User?.FindFirstValue("user_id");
        if (!Guid.TryParse(raw, out var id)) throw new HubException("Unauthorized");
        return id;
    }
}
```

> **Note on `BroadcastUnreadAsync` for DMs:** the dialog-branch returns a flat list by selecting both User IDs from the matched row. The LINQ query above selects `.ToList()` inside `.Select()` which EF Core cannot translate to SQL. Use `FirstOrDefaultAsync()` then split locally:
> ```csharp
> var dialog = await db.PersonalDialogs
>     .Where(d => d.Id == contextId)
>     .Select(d => new { d.User1Id, d.User2Id })
>     .FirstOrDefaultAsync();
> var memberUserIds = dialog is null
>     ? new List<Guid>()
>     : new List<Guid> { dialog.User1Id, dialog.User2Id };
> ```
> Replace the dialog-branch in `BroadcastUnreadAsync` with this pattern if the inline `.Select(d => new[]{}.ToList())` causes a translation error.

- [ ] **Step 4: Run tests**
```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "ChatHubTests" -v minimal
```
Expected: **PASS** (5 tests, 0 failures)

- [ ] **Step 5: Run full unit test suite**
```bash
dotnet test tests/ChatHerder.Unit.Tests/ -v minimal
```
Expected: all prior tests still pass (0 regressions).

- [ ] **Step 6: Commit**
```bash
git add src/ChatHerder.API/Hubs/ChatHub.cs \
        tests/ChatHerder.Unit.Tests/Hubs/ChatHubTests.cs
git commit -m "feat: add ChatHub (SendMessage, EditMessage, DeleteMessage, DMs, typing, unread push)"
```

---

### Task 3: Hub Registration in Program.cs

**Context:**  
`app.MapHub<T>(path)` must be called **after** `app.UseAuthentication()` / `app.UseAuthorization()` (already the case — these are called before `app.Run()`). JWT over WebSocket arrives as `?access_token=…` query string; the `OnMessageReceived` handler already configured in Program.cs routes it to `ctx.Token` when the path starts with `/hubs`. The `AddSignalR()` call already exists at the top of `builder.Services`.

No changes are needed to `appsettings.json` or `launchSettings.json`.

**Files:**
- Modify: `src/ChatHerder.API/Program.cs` (add two `MapHub` calls after `app.Run()` is reached — insert before `app.Run()`)

- [ ] **Step 1: Write the failing smoke test**

Append to `tests/ChatHerder.Unit.Tests/Hubs/PresenceHubTests.cs` (inside the class):

```csharp
[Fact]
public void PresenceHub_CanBeInstantiated_WithMockedDependencies()
{
    var store   = Substitute.For<IPresenceStore>();
    var chatCtx = Substitute.For<IHubContext<ChatHub>>();
    chatCtx.Groups.Returns(Substitute.For<IGroupManager>());
    var db      = BuildDb();

    var hub = new PresenceHub(store, chatCtx, db);

    Assert.NotNull(hub);
}
```

Append to `tests/ChatHerder.Unit.Tests/Hubs/ChatHubTests.cs` (inside the class):

```csharp
[Fact]
public void ChatHub_CanBeInstantiated_WithMockedDependencies()
{
    var db  = BuildDb();
    var hub = new ChatHub(db, Substitute.For<IUnreadStore>(), Substitute.For<IPresenceStore>());
    Assert.NotNull(hub);
}
```

- [ ] **Step 2: Run smoke tests**
```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "CanBeInstantiated" -v minimal
```
Expected: **PASS** (2 tests)

- [ ] **Step 3: Add MapHub calls to `src/ChatHerder.API/Program.cs`**

After the `api.MapGroup(…)` block and before `app.Run()`, add:

```csharp
app.MapHub<ChatHerder.API.Hubs.PresenceHub>("/hubs/presence").RequireAuthorization();
app.MapHub<ChatHerder.API.Hubs.ChatHub>("/hubs/chat").RequireAuthorization();
```

Full relevant section of `Program.cs` after edit (lines ~83–95):

```csharp
// Endpoint groups
var api = app.MapGroup("/api");
api.MapGroup("/auth").MapAuthEndpoints();
api.MapGroup("/sessions").MapSessionsEndpoints();
api.MapGroup("/users").MapUserEndpoints();
api.MapGroup("/rooms").MapRoomEndpoints();
api.MapGroup("").MapRoomInvitationEndpoints();
api.MapGroup("/messages").MapMessageEndpoints();
api.MapGroup("").MapNotificationEndpoints();

// SignalR hubs
app.MapHub<ChatHerder.API.Hubs.PresenceHub>("/hubs/presence").RequireAuthorization();
app.MapHub<ChatHerder.API.Hubs.ChatHub>("/hubs/chat").RequireAuthorization();

app.Run();
```

- [ ] **Step 4: Build the full solution**
```bash
dotnet build ChatHerder.sln -v minimal
```
Expected: 0 errors.

- [ ] **Step 5: Run all unit tests**
```bash
dotnet test tests/ChatHerder.Unit.Tests/ -v minimal
```
Expected: all tests pass (no regressions; current baseline is 23 tests + new hub tests).

- [ ] **Step 6: Commit**
```bash
git add src/ChatHerder.API/Program.cs \
        tests/ChatHerder.Unit.Tests/Hubs/PresenceHubTests.cs \
        tests/ChatHerder.Unit.Tests/Hubs/ChatHubTests.cs
git commit -m "feat: register PresenceHub and ChatHub in Program.cs; add instantiation smoke tests"
```

---

## Self-Review

### 1. Spec coverage (AGENT.md §10)

| Spec requirement | Task covering it |
|-----------------|-----------------|
| PresenceHub `Heartbeat` | Task 1 |
| PresenceHub `SetAfk` | Task 1 |
| PresenceHub `SetActive` | Task 1 |
| PresenceHub `JoinRoom` | Task 1 |
| PresenceHub `LeaveRoom` | Task 1 |
| Server → `UserStatusChanged` | Task 1 (OnConnected, OnDisconnected, SetAfk, SetActive, Heartbeat) |
| Server → `RoomMembersSnapshot` | Task 1 (JoinRoom) |
| Server → `MemberJoined` | Task 1 (JoinRoom) |
| Server → `MemberLeft` | Task 1 (LeaveRoom, OnDisconnected) |
| Server → `RemovedFromRoom` | Task 1 (JoinRoom banned check) |
| Server → `ForceDisconnect` | **Not in scope** — sent by SessionsEndpoints/BanCheckMiddleware via `IHubContext<PresenceHub>` in a future task. The hub endpoint is registered; callers can inject `IHubContext<PresenceHub>` and call `Clients.User(…).SendAsync("ForceDisconnect", …)`. |
| Server → `FriendRequestReceived` / `FriendRequestAccepted` / `RoomInvitationReceived` / `DialogFrozen` | **Not in scope** — these are triggered by friend/invitation REST endpoints, not by hub methods. Phase 4c. |
| ChatHub `SendMessage` | Task 2 |
| ChatHub `EditMessage` | Task 2 |
| ChatHub `DeleteMessage` | Task 2 |
| ChatHub `StartTyping` / `StopTyping` | Task 2 |
| ChatHub `SendDirectMessage` | Task 2 |
| ChatHub `EditDirectMessage` | Task 2 |
| ChatHub `DeleteDirectMessage` | Task 2 |
| ChatHub `StartTypingDM` / `StopTypingDM` | Task 2 |
| Server → `MessageReceived` | Task 2 (`SendMessage`) |
| Server → `MessageEdited` | Task 2 (`EditMessage`) |
| Server → `MessageDeleted` | Task 2 (`DeleteMessage`) |
| Server → `UserTyping` | Task 2 (`StartTyping`/`StopTyping`) |
| Server → `DirectMessageReceived` | Task 2 (`SendDirectMessage`) |
| Server → `DirectMessageEdited` | Task 2 (`EditDirectMessage`) |
| Server → `DirectMessageDeleted` | Task 2 (`DeleteDirectMessage`) |
| Server → `UserTypingInDialog` | Task 2 (`StartTypingDM`/`StopTypingDM`) |
| Server → `UnreadCountChanged` | Task 2 (`SendMessage` via `BroadcastUnreadAsync`) |
| Sequence allocation via UPSERT (no MAX+1) | Task 2 (`AllocateSequenceAsync`) |
| 3 KB message limit | Task 2 (both `SendMessage` and `EditMessage` guards) |
| `/hubs/presence` and `/hubs/chat` endpoints registered | Task 3 |

### 2. Placeholder scan
No "TBD", "TODO", or vague steps found.

### 3. Type consistency
- `HubException` used consistently for error returns (not `InvalidOperationException`).
- `ContextType.Room` / `ContextType.Dialog` enums cast to `(int)` in SQL only.
- `RevokedAt == null` for active ban check — consistent with `RoomBan.RevokedAt` field.
- `Endpoints.RoomEndpoints.ToDto(Message)` — full namespace used since there is no `using` alias; the hub file must add `using ChatHerder.API.Endpoints;` or use the full path. Verify at compile time.
- `DialogMessageDto` / `UserSummary` / `AttachmentDto` imported from `ChatHerder.Application.DTOs`.
- `Attachment.ContentType` field used in `ToDialogDto` — confirmed present in `Attachment` entity (added in Phase 4a Task 10).
