# Phase 4e: Friends, Blocks, and Personal Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement friends, blocks, and personal dialog REST endpoints on the backend and wire FriendRequestsComponent, ContactsHomeComponent, and DirectMessagesComponent to real data.

**Architecture:** Each backend feature is a Minimal API static class that reads/writes `AppDbContext` directly, following the pattern in `RoomEndpoints.cs`. Key handlers are exposed via `internal static` wrappers so unit tests can call them with an in-memory EF Core database. The three Angular components use new `FriendsApiService` and `DialogsApiService`, following the Phase 4d `import type` + Signals + `finalize()` pattern established in `rooms-api.service.ts` / `rooms-home.component.ts`.

**Tech Stack:** .NET 10 Minimal APIs, EF Core 10 (InMemory for tests), xUnit, Angular 21 Signals, HttpClient, HttpTestingController, Vitest, ChatService (Phase 4c).

**Scope note:** `BlocksApiService` Angular frontend service is deferred — the backend endpoint is fully implemented but no component is wired to it in this phase (no dedicated blocks page exists in the design). Platform bans deferred (no `/admin/bans` in AGENT.md §9).

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/ChatHerder.Application/DTOs/FriendDtos.cs` | `FriendDto`, `FriendRequestDto`, `BlockDto`, `DialogDto` + request records |
| Create | `src/ChatHerder.API/Endpoints/FriendsEndpoints.cs` | 6 friend routes + `internal static` test wrappers |
| Create | `tests/ChatHerder.Unit.Tests/Endpoints/FriendsEndpointsTests.cs` | 5 unit tests |
| Create | `src/ChatHerder.API/Endpoints/BlocksEndpoints.cs` | 3 block routes + `internal static` test wrappers |
| Create | `tests/ChatHerder.Unit.Tests/Endpoints/BlocksEndpointsTests.cs` | 4 unit tests |
| Create | `src/ChatHerder.API/Endpoints/DialogsEndpoints.cs` | 6 dialog routes + 2 dm-message routes + `internal static` test wrappers |
| Create | `tests/ChatHerder.Unit.Tests/Endpoints/DialogsEndpointsTests.cs` | 7 unit tests |
| Modify | `src/ChatHerder.API/Program.cs` | Register 3 new endpoint groups |
| Create | `frontend/src/app/core/friends/friends.models.ts` | `FriendDto`, `FriendRequestDto` TypeScript interfaces |
| Create | `frontend/src/app/core/friends/friends-api.service.ts` | HTTP client for `/api/friends/*` |
| Create | `frontend/src/app/core/friends/friends-api.service.spec.ts` | 6 tests with HttpTestingController |
| Create | `frontend/src/app/core/dialogs/dialogs.models.ts` | `DialogDto` TypeScript interface |
| Create | `frontend/src/app/core/dialogs/dialogs-api.service.ts` | HTTP client for `/api/dialogs/*` and `/api/dm-messages/*` |
| Create | `frontend/src/app/core/dialogs/dialogs-api.service.spec.ts` | 6 tests |
| Modify | `frontend/src/app/features/contacts/friend-requests/friend-requests.ts` | Wire FriendsApiService; computed signals for incoming/outgoing |
| Modify | `frontend/src/app/features/contacts/friend-requests/friend-requests.html` | `@for` over incoming/outgoing signals, accept/reject bindings |
| Modify | `frontend/src/app/features/contacts/friend-requests/friend-requests.spec.ts` | Add HTTP providers |
| Modify | `frontend/src/app/features/contacts/contacts-home/contacts-home.ts` | Wire FriendsApiService; friends list + remove |
| Modify | `frontend/src/app/features/contacts/contacts-home/contacts-home.html` | `@for` over friends signal, remove button binding |
| Modify | `frontend/src/app/features/contacts/contacts-home/contacts-home.spec.ts` | Add HTTP providers |
| Modify | `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts` | Wire DialogsApiService + ChatService; dialog selection + real-time |
| Modify | `frontend/src/app/features/dialogs/direct-messages/direct-messages.html` | `@for` dialogs/messages, selected dialog pane, compose area |
| Modify | `frontend/src/app/features/dialogs/direct-messages/direct-messages.spec.ts` | Add HTTP providers |

---

## Context Reference

### Patterns to follow (read these files before implementing)
- `src/ChatHerder.API/Endpoints/RoomEndpoints.cs` — `static class`, `RouteGroupBuilder` extension, `internal static` wrappers, private handler methods
- `tests/ChatHerder.Unit.Tests/Endpoints/RoomEndpointsTests.cs` — `BuildContext()`, `MakePrincipal()`, `GetStatusCode()` helper pattern
- `frontend/src/app/core/rooms/rooms-api.service.ts` — `import type`, `inject()`, `HttpClient`, `Observable<T>`, `HttpParams`
- `frontend/src/app/core/rooms/rooms-api.service.spec.ts` — `TestBed`, `HttpTestingController`, `provideHttpClient()`, `provideHttpClientTesting()`
- `frontend/src/app/features/rooms/room-invitations/room-invitations.ts` — canonical signal component: `signal<T[]>([])`, `finalize()`, `.subscribe()`, load in constructor

### Critical domain invariants (the tests must prove these work)
- `Friendship`: always compute `var (u1, u2) = a < b ? (a, b) : (b, a);` before any Friendship INSERT or WHERE query. The EF unique index on `(User1Id, User2Id)` will create duplicate rows if ordering flips.
- `PersonalDialog`: same `User1Id < User2Id` invariant.
- Blocking: removing a block target's friendship AND freezing their shared dialog (`FrozenAt = DateTime.UtcNow`) must happen in the same `SaveChangesAsync` call.
- Friend request preconditions: (1) not self, (2) not already friends, (3) no existing Pending request in same direction, (4) neither side has blocked the other.
- Dialog GET /messages: caller must be `User1Id` or `User2Id` of the dialog.

### Backend DTOs defined in Task 1 (`FriendDtos.cs`)
```csharp
FriendRequestDto(Guid Id, Guid SenderId, string SenderUsername, string? SenderAvatarUrl,
    Guid ReceiverId, string ReceiverUsername, string? ReceiverAvatarUrl,
    string Status, string? Message, DateTime CreatedAt)

FriendDto(Guid FriendshipId, Guid UserId, string Username, string? AvatarUrl, DateTime FriendSince)

BlockDto(Guid BlockedUserId, string BlockedUsername, string? BlockedAvatarUrl, DateTime CreatedAt)

DialogDto(Guid Id, Guid OtherUserId, string OtherUsername, string? OtherAvatarUrl,
    DateTime CreatedAt, bool IsFrozen)

SendFriendRequestRequest(string Username, string? Message)
BlockUserRequest(Guid UserId)
CreateDialogRequest(Guid UserId)
EditDmMessageRequest(string Content)
```

`DialogMessageDto` already exists in `src/ChatHerder.Application/DTOs/MessageDtos.cs` — do not duplicate.

---

## Task 1: Application DTOs — FriendDtos.cs

**Files:**
- Create: `src/ChatHerder.Application/DTOs/FriendDtos.cs`

No logic — just records. No test needed.

- [ ] **Step 1: Create the DTO file**

```csharp
namespace ChatHerder.Application.DTOs;

public sealed record FriendRequestDto(
    Guid Id,
    Guid SenderId,
    string SenderUsername,
    string? SenderAvatarUrl,
    Guid ReceiverId,
    string ReceiverUsername,
    string? ReceiverAvatarUrl,
    string Status,
    string? Message,
    DateTime CreatedAt);

public sealed record FriendDto(
    Guid FriendshipId,
    Guid UserId,
    string Username,
    string? AvatarUrl,
    DateTime FriendSince);

public sealed record BlockDto(
    Guid BlockedUserId,
    string BlockedUsername,
    string? BlockedAvatarUrl,
    DateTime CreatedAt);

public sealed record DialogDto(
    Guid Id,
    Guid OtherUserId,
    string OtherUsername,
    string? OtherAvatarUrl,
    DateTime CreatedAt,
    bool IsFrozen);

public sealed record SendFriendRequestRequest(string Username, string? Message);
public sealed record BlockUserRequest(Guid UserId);
public sealed record CreateDialogRequest(Guid UserId);
public sealed record EditDmMessageRequest(string Content);
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /path/to/repo && dotnet build ChatHerder.sln
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/ChatHerder.Application/DTOs/FriendDtos.cs
git commit -m "feat: add FriendDtos, BlockDto, DialogDto application DTOs"
```

---

## Task 2: FriendsEndpoints.cs (TDD)

**Files:**
- Create: `src/ChatHerder.API/Endpoints/FriendsEndpoints.cs`
- Create: `tests/ChatHerder.Unit.Tests/Endpoints/FriendsEndpointsTests.cs`

- [ ] **Step 1: Write the failing tests**

```csharp
// tests/ChatHerder.Unit.Tests/Endpoints/FriendsEndpointsTests.cs
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class FriendsEndpointsTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(opts);
    }

    private static ClaimsPrincipal MakePrincipal(Guid userId) =>
        new(new ClaimsIdentity([
            new Claim("user_id", userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test"));

    private static int GetStatusCode(IResult r)
    {
        var prop = r.GetType().GetProperty("StatusCode");
        return (int)(prop?.GetValue(r) ?? 0);
    }

    [Fact]
    public async Task GetFriends_ReturnsOk_WithFriendInList()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        db.Friendships.Add(new Friendship { User1Id = u1, User2Id = u2 });
        await db.SaveChangesAsync();

        var result = await FriendsEndpointsHelper.GetFriends(MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
    }

    [Fact]
    public async Task SendRequest_ReturnsNoContent_WhenValid()
    {
        await using var db = BuildContext();
        var sender   = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var receiver = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(sender, receiver);
        await db.SaveChangesAsync();

        var req    = new SendFriendRequestRequest("bob", null);
        var result = await FriendsEndpointsHelper.SendRequest(req, MakePrincipal(sender.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.FriendRequests.CountAsync());
    }

    [Fact]
    public async Task AcceptRequest_ReturnsNoContent_AndCreatesFriendship()
    {
        await using var db = BuildContext();
        var sender   = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var receiver = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(sender, receiver);
        var request = new FriendRequest
        {
            SenderId   = sender.Id,
            ReceiverId = receiver.Id,
            Status     = FriendRequestStatus.Pending,
        };
        db.FriendRequests.Add(request);
        await db.SaveChangesAsync();

        var result = await FriendsEndpointsHelper.AcceptRequest(request.Id, MakePrincipal(receiver.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.Friendships.CountAsync());
        // invariant: User1Id < User2Id
        var friendship = await db.Friendships.SingleAsync();
        Assert.True(friendship.User1Id < friendship.User2Id);
    }

    [Fact]
    public async Task RejectRequest_ReturnsNoContent_AndSetsStatus()
    {
        await using var db = BuildContext();
        var sender   = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var receiver = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(sender, receiver);
        var request = new FriendRequest
        {
            SenderId   = sender.Id,
            ReceiverId = receiver.Id,
            Status     = FriendRequestStatus.Pending,
        };
        db.FriendRequests.Add(request);
        await db.SaveChangesAsync();

        var result = await FriendsEndpointsHelper.RejectRequest(request.Id, MakePrincipal(receiver.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        var updated = await db.FriendRequests.FindAsync(request.Id);
        Assert.Equal(FriendRequestStatus.Rejected, updated!.Status);
    }

    [Fact]
    public async Task RemoveFriend_ReturnsNoContent_AndDeletesFriendship()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        db.Friendships.Add(new Friendship { User1Id = u1, User2Id = u2 });
        await db.SaveChangesAsync();

        var result = await FriendsEndpointsHelper.RemoveFriend(user2.Id, MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(0, await db.Friendships.CountAsync());
    }
}

internal static class FriendsEndpointsHelper
{
    public static Task<IResult> GetFriends(ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.FriendsEndpoints.GetFriendsInternal(p, db, ct);

    public static Task<IResult> SendRequest(SendFriendRequestRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.FriendsEndpoints.SendRequestInternal(req, p, db, ct);

    public static Task<IResult> AcceptRequest(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.FriendsEndpoints.AcceptRequestInternal(id, p, db, ct);

    public static Task<IResult> RejectRequest(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.FriendsEndpoints.RejectRequestInternal(id, p, db, ct);

    public static Task<IResult> RemoveFriend(Guid userId, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.FriendsEndpoints.RemoveFriendInternal(userId, p, db, ct);
}
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
dotnet test ChatHerder.sln --filter "FullyQualifiedName~FriendsEndpointsTests"
```
Expected: build error — `FriendsEndpoints` does not exist.

- [ ] **Step 3: Implement FriendsEndpoints.cs**

```csharp
// src/ChatHerder.API/Endpoints/FriendsEndpoints.cs
using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class FriendsEndpoints
{
    public static RouteGroupBuilder MapFriendsEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("",                              GetFriends)    .RequireAuthorization();
        group.MapGet("/requests",                    GetRequests)   .RequireAuthorization();
        group.MapPost("/requests",                   SendRequest)   .RequireAuthorization();
        group.MapPost("/requests/{id:guid}/accept",  AcceptRequest) .RequireAuthorization();
        group.MapPost("/requests/{id:guid}/reject",  RejectRequest) .RequireAuthorization();
        group.MapDelete("/{userId:guid}",            RemoveFriend)  .RequireAuthorization();
        return group;
    }

    internal static Task<IResult> GetFriendsInternal(ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => GetFriends(p, db, ct);
    internal static Task<IResult> SendRequestInternal(SendFriendRequestRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => SendRequest(req, p, db, ct);
    internal static Task<IResult> AcceptRequestInternal(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => AcceptRequest(id, p, db, ct);
    internal static Task<IResult> RejectRequestInternal(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => RejectRequest(id, p, db, ct);
    internal static Task<IResult> RemoveFriendInternal(Guid userId, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => RemoveFriend(userId, p, db, ct);

    private static async Task<IResult> GetFriends(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var friendships = await db.Friendships
            .Where(f => f.User1Id == userId || f.User2Id == userId)
            .Include(f => f.User1)
            .Include(f => f.User2)
            .ToListAsync(ct);

        var dtos = friendships.Select(f =>
        {
            var otherId       = f.User1Id == userId ? f.User2Id       : f.User1Id;
            var otherUsername = f.User1Id == userId ? f.User2.Username : f.User1.Username;
            var otherAvatar   = f.User1Id == userId ? f.User2.AvatarUrl : f.User1.AvatarUrl;
            return new FriendDto(f.Id, otherId, otherUsername, otherAvatar, f.CreatedAt);
        });

        return Results.Ok(dtos);
    }

    private static async Task<IResult> GetRequests(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var requests = await db.FriendRequests
            .Where(r => (r.SenderId == userId || r.ReceiverId == userId)
                        && r.Status == FriendRequestStatus.Pending)
            .Include(r => r.Sender)
            .Include(r => r.Receiver)
            .Select(r => new FriendRequestDto(
                r.Id,
                r.SenderId, r.Sender.Username, r.Sender.AvatarUrl,
                r.ReceiverId, r.Receiver.Username, r.Receiver.AvatarUrl,
                r.Status.ToString(), r.Message, r.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(requests);
    }

    private static async Task<IResult> SendRequest(
        SendFriendRequestRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var senderId))
            return Results.Unauthorized();

        var receiver = await db.Users
            .FirstOrDefaultAsync(u => u.Username == req.Username && u.DeletedAt == null, ct);
        if (receiver is null) return Results.NotFound(new { error = "User not found." });
        if (receiver.Id == senderId)
            return Results.BadRequest(new { error = "Cannot send a friend request to yourself." });

        var (u1, u2) = senderId < receiver.Id ? (senderId, receiver.Id) : (receiver.Id, senderId);
        if (await db.Friendships.AnyAsync(f => f.User1Id == u1 && f.User2Id == u2, ct))
            return Results.Conflict(new { error = "You are already friends." });

        if (await db.FriendRequests.AnyAsync(r =>
                r.SenderId == senderId && r.ReceiverId == receiver.Id
                && r.Status == FriendRequestStatus.Pending, ct))
            return Results.Conflict(new { error = "A friend request is already pending." });

        if (await db.UserBlocks.AnyAsync(b =>
                (b.BlockerId == senderId && b.BlockedUserId == receiver.Id) ||
                (b.BlockerId == receiver.Id && b.BlockedUserId == senderId), ct))
            return Results.Problem("Cannot send friend request due to a block.", statusCode: 403);

        db.FriendRequests.Add(new FriendRequest
        {
            SenderId   = senderId,
            ReceiverId = receiver.Id,
            Message    = req.Message,
            Status     = FriendRequestStatus.Pending,
        });
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> AcceptRequest(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var request = await db.FriendRequests
            .FirstOrDefaultAsync(r => r.Id == id && r.ReceiverId == userId
                                       && r.Status == FriendRequestStatus.Pending, ct);
        if (request is null) return Results.NotFound();

        request.Status      = FriendRequestStatus.Accepted;
        request.RespondedAt = DateTime.UtcNow;

        var (u1, u2) = request.SenderId < userId
            ? (request.SenderId, userId)
            : (userId, request.SenderId);
        db.Friendships.Add(new Friendship { User1Id = u1, User2Id = u2 });

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RejectRequest(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var request = await db.FriendRequests
            .FirstOrDefaultAsync(r => r.Id == id && r.ReceiverId == userId
                                       && r.Status == FriendRequestStatus.Pending, ct);
        if (request is null) return Results.NotFound();

        request.Status      = FriendRequestStatus.Rejected;
        request.RespondedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RemoveFriend(
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var (u1, u2) = callerId < userId ? (callerId, userId) : (userId, callerId);
        var friendship = await db.Friendships
            .FirstOrDefaultAsync(f => f.User1Id == u1 && f.User2Id == u2, ct);
        if (friendship is null) return Results.NotFound();

        db.Friendships.Remove(friendship);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
```

- [ ] **Step 4: Run tests — confirm GREEN**

```bash
dotnet test ChatHerder.sln --filter "FullyQualifiedName~FriendsEndpointsTests"
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ChatHerder.API/Endpoints/FriendsEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/FriendsEndpointsTests.cs
git commit -m "feat: add FriendsEndpoints with 6 routes (TDD, 5 tests)"
```

---

## Task 3: BlocksEndpoints.cs (TDD)

**Files:**
- Create: `src/ChatHerder.API/Endpoints/BlocksEndpoints.cs`
- Create: `tests/ChatHerder.Unit.Tests/Endpoints/BlocksEndpointsTests.cs`

- [ ] **Step 1: Write the failing tests**

```csharp
// tests/ChatHerder.Unit.Tests/Endpoints/BlocksEndpointsTests.cs
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class BlocksEndpointsTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(opts);
    }

    private static ClaimsPrincipal MakePrincipal(Guid userId) =>
        new(new ClaimsIdentity([
            new Claim("user_id", userId.ToString()),
        ], "Test"));

    private static int GetStatusCode(IResult r)
    {
        var prop = r.GetType().GetProperty("StatusCode");
        return (int)(prop?.GetValue(r) ?? 0);
    }

    [Fact]
    public async Task BlockUser_ReturnsNoContent_WhenValid()
    {
        await using var db = BuildContext();
        var blocker = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var target  = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(blocker, target);
        await db.SaveChangesAsync();

        var result = await BlocksEndpointsHelper.BlockUser(
            new BlockUserRequest(target.Id), MakePrincipal(blocker.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.UserBlocks.CountAsync());
    }

    [Fact]
    public async Task BlockUser_AlsoRemovesFriendship_WhenFriendshipExists()
    {
        await using var db = BuildContext();
        var blocker = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var target  = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(blocker, target);
        var (u1, u2) = blocker.Id < target.Id ? (blocker.Id, target.Id) : (target.Id, blocker.Id);
        db.Friendships.Add(new Friendship { User1Id = u1, User2Id = u2 });
        await db.SaveChangesAsync();

        await BlocksEndpointsHelper.BlockUser(
            new BlockUserRequest(target.Id), MakePrincipal(blocker.Id), db, CancellationToken.None);

        Assert.Equal(0, await db.Friendships.CountAsync());
    }

    [Fact]
    public async Task BlockUser_AlsoFreezesDialog_WhenDialogExists()
    {
        await using var db = BuildContext();
        var blocker = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var target  = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(blocker, target);
        var (u1, u2) = blocker.Id < target.Id ? (blocker.Id, target.Id) : (target.Id, blocker.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        await db.SaveChangesAsync();

        await BlocksEndpointsHelper.BlockUser(
            new BlockUserRequest(target.Id), MakePrincipal(blocker.Id), db, CancellationToken.None);

        var updated = await db.PersonalDialogs.FindAsync(dialog.Id);
        Assert.NotNull(updated!.FrozenAt);
    }

    [Fact]
    public async Task UnblockUser_ReturnsNoContent_WhenValid()
    {
        await using var db = BuildContext();
        var blocker = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var target  = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(blocker, target);
        db.UserBlocks.Add(new UserBlock { BlockerId = blocker.Id, BlockedUserId = target.Id });
        await db.SaveChangesAsync();

        var result = await BlocksEndpointsHelper.UnblockUser(
            target.Id, MakePrincipal(blocker.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(0, await db.UserBlocks.CountAsync());
    }
}

internal static class BlocksEndpointsHelper
{
    public static Task<IResult> BlockUser(BlockUserRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.BlocksEndpoints.BlockUserInternal(req, p, db, ct);

    public static Task<IResult> UnblockUser(Guid userId, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.BlocksEndpoints.UnblockUserInternal(userId, p, db, ct);
}
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
dotnet test ChatHerder.sln --filter "FullyQualifiedName~BlocksEndpointsTests"
```
Expected: build error — `BlocksEndpoints` does not exist.

- [ ] **Step 3: Implement BlocksEndpoints.cs**

```csharp
// src/ChatHerder.API/Endpoints/BlocksEndpoints.cs
using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class BlocksEndpoints
{
    public static RouteGroupBuilder MapBlocksEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("",                   GetBlocks)   .RequireAuthorization();
        group.MapPost("",                  BlockUser)   .RequireAuthorization();
        group.MapDelete("/{userId:guid}",  UnblockUser) .RequireAuthorization();
        return group;
    }

    internal static Task<IResult> BlockUserInternal(BlockUserRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => BlockUser(req, p, db, ct);
    internal static Task<IResult> UnblockUserInternal(Guid userId, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => UnblockUser(userId, p, db, ct);

    private static async Task<IResult> GetBlocks(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var blocks = await db.UserBlocks
            .Where(b => b.BlockerId == userId)
            .Include(b => b.BlockedUser)
            .Select(b => new BlockDto(b.BlockedUserId, b.BlockedUser.Username, b.BlockedUser.AvatarUrl, b.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(blocks);
    }

    private static async Task<IResult> BlockUser(
        BlockUserRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var blockerId))
            return Results.Unauthorized();

        if (req.UserId == blockerId)
            return Results.BadRequest(new { error = "Cannot block yourself." });

        var target = await db.Users.FirstOrDefaultAsync(u => u.Id == req.UserId && u.DeletedAt == null, ct);
        if (target is null) return Results.NotFound(new { error = "User not found." });

        if (await db.UserBlocks.AnyAsync(b => b.BlockerId == blockerId && b.BlockedUserId == req.UserId, ct))
            return Results.Conflict(new { error = "User is already blocked." });

        db.UserBlocks.Add(new UserBlock { BlockerId = blockerId, BlockedUserId = req.UserId });

        // Remove friendship if it exists (same invariant: smaller Guid is User1Id)
        var (u1, u2) = blockerId < req.UserId ? (blockerId, req.UserId) : (req.UserId, blockerId);
        var friendship = await db.Friendships
            .FirstOrDefaultAsync(f => f.User1Id == u1 && f.User2Id == u2, ct);
        if (friendship is not null) db.Friendships.Remove(friendship);

        // Freeze the dialog if it exists and is not already frozen
        var dialog = await db.PersonalDialogs
            .FirstOrDefaultAsync(d => d.User1Id == u1 && d.User2Id == u2, ct);
        if (dialog is not null && dialog.FrozenAt is null)
            dialog.FrozenAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> UnblockUser(
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var blockerId))
            return Results.Unauthorized();

        var block = await db.UserBlocks
            .FirstOrDefaultAsync(b => b.BlockerId == blockerId && b.BlockedUserId == userId, ct);
        if (block is null) return Results.NotFound();

        db.UserBlocks.Remove(block);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
```

- [ ] **Step 4: Run tests — confirm GREEN**

```bash
dotnet test ChatHerder.sln --filter "FullyQualifiedName~BlocksEndpointsTests"
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ChatHerder.API/Endpoints/BlocksEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/BlocksEndpointsTests.cs
git commit -m "feat: add BlocksEndpoints with block/unblock + cascade friendship+dialog side effects (TDD, 4 tests)"
```

---

## Task 4: DialogsEndpoints.cs (TDD)

**Files:**
- Create: `src/ChatHerder.API/Endpoints/DialogsEndpoints.cs`
- Create: `tests/ChatHerder.Unit.Tests/Endpoints/DialogsEndpointsTests.cs`

Note: This file covers both `/dialogs/*` and `/dm-messages/*` routes via two extension methods mounted at different groups in Program.cs (Task 5).

- [ ] **Step 1: Write the failing tests**

```csharp
// tests/ChatHerder.Unit.Tests/Endpoints/DialogsEndpointsTests.cs
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class DialogsEndpointsTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(opts);
    }

    private static ClaimsPrincipal MakePrincipal(Guid userId) =>
        new(new ClaimsIdentity([
            new Claim("user_id", userId.ToString()),
        ], "Test"));

    private static int GetStatusCode(IResult r)
    {
        var prop = r.GetType().GetProperty("StatusCode");
        return (int)(prop?.GetValue(r) ?? 0);
    }

    [Fact]
    public async Task CreateDialog_ReturnsOk_WithNewDialog()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.CreateDialog(
            new CreateDialogRequest(user2.Id), MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
        Assert.Equal(1, await db.PersonalDialogs.CountAsync());
        // invariant: User1Id < User2Id
        var dialog = await db.PersonalDialogs.SingleAsync();
        Assert.True(dialog.User1Id < dialog.User2Id);
    }

    [Fact]
    public async Task CreateDialog_ReturnsExistingDialog_WhenAlreadyExists()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        db.PersonalDialogs.Add(new PersonalDialog { User1Id = u1, User2Id = u2 });
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.CreateDialog(
            new CreateDialogRequest(user2.Id), MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
        Assert.Equal(1, await db.PersonalDialogs.CountAsync()); // no duplicate
    }

    [Fact]
    public async Task GetDialog_ReturnsOk_WhenParticipant()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.GetDialog(
            dialog.Id, MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
    }

    [Fact]
    public async Task GetDialog_Returns403_WhenNotParticipant()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        var user3 = new User { Username = "carol", Email = "carol@test.com", PasswordHash = "x" };
        db.Users.AddRange(user1, user2, user3);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.GetDialog(
            dialog.Id, MakePrincipal(user3.Id), db, CancellationToken.None);

        Assert.Equal(403, GetStatusCode(result));
    }

    [Fact]
    public async Task GetMessages_ReturnsOk_WithHistory()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        db.PersonalDialogMessages.Add(new PersonalDialogMessage
        {
            DialogId = dialog.Id, AuthorId = user1.Id, Content = "Hello", SequenceNumber = 1,
        });
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.GetMessages(
            dialog.Id, MakePrincipal(user1.Id), db, null, 50, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
    }

    [Fact]
    public async Task EditDmMessage_ReturnsOk_WhenSender()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        var msg = new PersonalDialogMessage
        {
            DialogId = dialog.Id, AuthorId = user1.Id, Content = "old", SequenceNumber = 1,
        };
        db.PersonalDialogMessages.Add(msg);
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.EditDmMessage(
            msg.Id, new EditDmMessageRequest("new content"), MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
        var updated = await db.PersonalDialogMessages.FindAsync(msg.Id);
        Assert.Equal("new content", updated!.Content);
    }

    [Fact]
    public async Task DeleteDmMessage_ReturnsNoContent_WhenSender()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        var msg = new PersonalDialogMessage
        {
            DialogId = dialog.Id, AuthorId = user1.Id, Content = "bye", SequenceNumber = 1,
        };
        db.PersonalDialogMessages.Add(msg);
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.DeleteDmMessage(
            msg.Id, MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        var updated = await db.PersonalDialogMessages.FindAsync(msg.Id);
        Assert.NotNull(updated!.DeletedAt);
    }
}

internal static class DialogsEndpointsHelper
{
    public static Task<IResult> CreateDialog(CreateDialogRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.DialogsEndpoints.CreateDialogInternal(req, p, db, ct);

    public static Task<IResult> GetDialog(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.DialogsEndpoints.GetDialogInternal(id, p, db, ct);

    public static Task<IResult> GetMessages(Guid id, ClaimsPrincipal p, AppDbContext db, Guid? before, int limit, CancellationToken ct)
        => ChatHerder.API.Endpoints.DialogsEndpoints.GetMessagesInternal(id, p, db, before, limit, ct);

    public static Task<IResult> EditDmMessage(Guid id, EditDmMessageRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.DialogsEndpoints.EditDmMessageInternal(id, req, p, db, ct);

    public static Task<IResult> DeleteDmMessage(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.DialogsEndpoints.DeleteDmMessageInternal(id, p, db, ct);
}
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
dotnet test ChatHerder.sln --filter "FullyQualifiedName~DialogsEndpointsTests"
```
Expected: build error — `DialogsEndpoints` does not exist.

- [ ] **Step 3: Implement DialogsEndpoints.cs**

```csharp
// src/ChatHerder.API/Endpoints/DialogsEndpoints.cs
using System.Security.Claims;
using System.Text;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class DialogsEndpoints
{
    private const int MaxMessageBytes = 3072;

    public static RouteGroupBuilder MapDialogEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("",             GetDialogs)   .RequireAuthorization();
        group.MapPost("",            CreateDialog) .RequireAuthorization();
        group.MapGet("/{id:guid}",   GetDialog)    .RequireAuthorization();
        group.MapGet("/{id:guid}/messages", GetMessages).RequireAuthorization();
        return group;
    }

    public static RouteGroupBuilder MapDmMessageEndpoints(this RouteGroupBuilder group)
    {
        group.MapPatch("/{id:guid}",  EditDmMessage)   .RequireAuthorization();
        group.MapDelete("/{id:guid}", DeleteDmMessage) .RequireAuthorization();
        return group;
    }

    internal static Task<IResult> CreateDialogInternal(CreateDialogRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => CreateDialog(req, p, db, ct);
    internal static Task<IResult> GetDialogInternal(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => GetDialog(id, p, db, ct);
    internal static Task<IResult> GetMessagesInternal(Guid id, ClaimsPrincipal p, AppDbContext db, Guid? before, int limit, CancellationToken ct)
        => GetMessages(id, p, db, before, limit, ct);
    internal static Task<IResult> EditDmMessageInternal(Guid id, EditDmMessageRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => EditDmMessage(id, req, p, db, ct);
    internal static Task<IResult> DeleteDmMessageInternal(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => DeleteDmMessage(id, p, db, ct);

    private static async Task<IResult> GetDialogs(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var dialogs = await db.PersonalDialogs
            .Where(d => d.User1Id == userId || d.User2Id == userId)
            .Include(d => d.User1)
            .Include(d => d.User2)
            .ToListAsync(ct);

        var dtos = dialogs.Select(d => ToDialogDto(d, userId));
        return Results.Ok(dtos);
    }

    private static async Task<IResult> CreateDialog(
        CreateDialogRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        if (req.UserId == callerId)
            return Results.BadRequest(new { error = "Cannot create a dialog with yourself." });

        var other = await db.Users.FirstOrDefaultAsync(u => u.Id == req.UserId && u.DeletedAt == null, ct);
        if (other is null) return Results.NotFound(new { error = "User not found." });

        var (u1, u2) = callerId < req.UserId ? (callerId, req.UserId) : (req.UserId, callerId);

        var existing = await db.PersonalDialogs
            .Include(d => d.User1)
            .Include(d => d.User2)
            .FirstOrDefaultAsync(d => d.User1Id == u1 && d.User2Id == u2, ct);

        if (existing is not null) return Results.Ok(ToDialogDto(existing, callerId));

        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        await db.SaveChangesAsync(ct);

        // Reload with navigations for response
        var full = await db.PersonalDialogs
            .Include(d => d.User1)
            .Include(d => d.User2)
            .FirstAsync(d => d.Id == dialog.Id, ct);

        return Results.Ok(ToDialogDto(full, callerId));
    }

    private static async Task<IResult> GetDialog(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var dialog = await db.PersonalDialogs
            .Include(d => d.User1)
            .Include(d => d.User2)
            .FirstOrDefaultAsync(d => d.Id == id, ct);

        if (dialog is null) return Results.NotFound();
        if (dialog.User1Id != userId && dialog.User2Id != userId) return Results.Forbid();

        return Results.Ok(ToDialogDto(dialog, userId));
    }

    private static async Task<IResult> GetMessages(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        Guid? before = null,
        int limit = 50,
        CancellationToken ct = default)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var dialog = await db.PersonalDialogs.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (dialog is null) return Results.NotFound();
        if (dialog.User1Id != userId && dialog.User2Id != userId) return Results.Forbid();

        limit = Math.Clamp(limit, 1, 100);

        IQueryable<PersonalDialogMessage> query = db.PersonalDialogMessages
            .Where(m => m.DialogId == id)
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author);

        if (before.HasValue)
        {
            var cursor = await db.PersonalDialogMessages.FirstOrDefaultAsync(m => m.Id == before, ct);
            if (cursor is null) return Results.BadRequest(new { error = "Cursor message not found." });

            query = query
                .Where(m => m.SentAt < cursor.SentAt || (m.SentAt == cursor.SentAt && m.Id.CompareTo(cursor.Id) < 0))
                .OrderByDescending(m => m.SentAt).ThenByDescending(m => m.Id)
                .Take(limit);
        }
        else
        {
            query = query
                .OrderByDescending(m => m.SentAt).ThenByDescending(m => m.Id)
                .Take(limit);
        }

        var messages = await query.ToListAsync(ct);
        return Results.Ok(messages.Select(ToMessageDto));
    }

    private static async Task<IResult> EditDmMessage(
        Guid id,
        EditDmMessageRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Content))
            return Results.BadRequest(new { error = "Content cannot be empty." });
        if (Encoding.UTF8.GetByteCount(req.Content) > MaxMessageBytes)
            return Results.BadRequest(new { error = "Message exceeds 3 KB limit." });

        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var msg = await db.PersonalDialogMessages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstOrDefaultAsync(m => m.Id == id && m.DeletedAt == null, ct);

        if (msg is null) return Results.NotFound();
        if (msg.AuthorId != userId) return Results.Forbid();

        msg.Content  = req.Content;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.Ok(ToMessageDto(msg));
    }

    private static async Task<IResult> DeleteDmMessage(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var msg = await db.PersonalDialogMessages
            .FirstOrDefaultAsync(m => m.Id == id && m.DeletedAt == null, ct);

        if (msg is null) return Results.NotFound();
        if (msg.AuthorId != userId) return Results.Forbid();

        msg.DeletedAt       = DateTime.UtcNow;
        msg.DeletedByUserId = userId;
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    private static DialogDto ToDialogDto(PersonalDialog d, Guid callerId)
    {
        var otherId       = d.User1Id == callerId ? d.User2Id       : d.User1Id;
        var otherUsername = d.User1Id == callerId ? d.User2.Username : d.User1.Username;
        var otherAvatar   = d.User1Id == callerId ? d.User2.AvatarUrl : d.User1.AvatarUrl;
        return new DialogDto(d.Id, otherId, otherUsername, otherAvatar, d.CreatedAt, d.FrozenAt.HasValue);
    }

    private static DialogMessageDto ToMessageDto(PersonalDialogMessage m) =>
        new(m.Id, m.SequenceNumber,
            m.DeletedAt.HasValue ? null : m.Content,
            new UserSummary(m.Author.Id, m.Author.Username, m.Author.AvatarUrl),
            m.SentAt, m.EditedAt,
            m.DeletedAt.HasValue,
            m.ReplyToMessage is null ? null : ToMessageDto(m.ReplyToMessage),
            m.Attachment is null ? null
                : new AttachmentDto(m.Attachment.Id, m.Attachment.FileName,
                    m.Attachment.ContentType, m.Attachment.SizeBytes, m.Attachment.Comment));
}
```

Note: `PersonalDialogMessage.DeletedByUserId` is `Guid?` (check the entity — the assignment `msg.DeletedByUserId = userId` confirms this).

- [ ] **Step 4: Run tests — confirm GREEN**

```bash
dotnet test ChatHerder.sln --filter "FullyQualifiedName~DialogsEndpointsTests"
```
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ChatHerder.API/Endpoints/DialogsEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/DialogsEndpointsTests.cs
git commit -m "feat: add DialogsEndpoints — GET/POST dialogs, GET messages, PATCH/DELETE dm-messages (TDD, 7 tests)"
```

---

## Task 5: Register New Endpoints in Program.cs

**Files:**
- Modify: `src/ChatHerder.API/Program.cs`

- [ ] **Step 1: Add the 3 new endpoint group registrations**

Locate the existing registrations block in `Program.cs` (after `api.MapGroup("/messages").MapMessageEndpoints();`) and add:

```csharp
api.MapGroup("/friends").MapFriendsEndpoints();
api.MapGroup("/blocks").MapBlocksEndpoints();
api.MapGroup("/dialogs").MapDialogEndpoints();
api.MapGroup("/dm-messages").MapDmMessageEndpoints();
```

The final registration block should look like:
```csharp
var api = app.MapGroup("/api");
api.MapGroup("/auth").MapAuthEndpoints();
api.MapGroup("/sessions").MapSessionsEndpoints();
api.MapGroup("/users").MapUserEndpoints();
api.MapGroup("/rooms").MapRoomEndpoints();
api.MapGroup("").MapRoomInvitationEndpoints();
api.MapGroup("/messages").MapMessageEndpoints();
api.MapGroup("").MapNotificationEndpoints();
api.MapGroup("/friends").MapFriendsEndpoints();
api.MapGroup("/blocks").MapBlocksEndpoints();
api.MapGroup("/dialogs").MapDialogEndpoints();
api.MapGroup("/dm-messages").MapDmMessageEndpoints();
```

- [ ] **Step 2: Build and run all tests**

```bash
dotnet build ChatHerder.sln && dotnet test ChatHerder.sln
```
Expected: 0 build errors, all tests pass (count will be existing + 16 new).

- [ ] **Step 3: Commit**

```bash
git add src/ChatHerder.API/Program.cs
git commit -m "feat: register friends, blocks, dialogs, and dm-messages endpoints in Program.cs"
```

---

## Task 6: Angular FriendsApiService

**Files:**
- Create: `frontend/src/app/core/friends/friends.models.ts`
- Create: `frontend/src/app/core/friends/friends-api.service.ts`
- Create: `frontend/src/app/core/friends/friends-api.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/core/friends/friends-api.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { FriendsApiService } from './friends-api.service';

describe('FriendsApiService', () => {
  let service: FriendsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FriendsApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FriendsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getFriends() sends GET /api/friends', () => {
    service.getFriends().subscribe();
    const req = http.expectOne('/api/friends');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getFriendRequests() sends GET /api/friends/requests', () => {
    service.getFriendRequests().subscribe();
    const req = http.expectOne('/api/friends/requests');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('sendFriendRequest() sends POST /api/friends/requests with body', () => {
    service.sendFriendRequest('bob', 'hi').subscribe();
    const req = http.expectOne('/api/friends/requests');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'bob', message: 'hi' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('acceptFriendRequest() sends POST /api/friends/requests/{id}/accept', () => {
    const id = '11111111-0000-0000-0000-000000000000';
    service.acceptFriendRequest(id).subscribe();
    const req = http.expectOne(`/api/friends/requests/${id}/accept`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('rejectFriendRequest() sends POST /api/friends/requests/{id}/reject', () => {
    const id = '22222222-0000-0000-0000-000000000000';
    service.rejectFriendRequest(id).subscribe();
    const req = http.expectOne(`/api/friends/requests/${id}/reject`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('removeFriend() sends DELETE /api/friends/{userId}', () => {
    const userId = '33333333-0000-0000-0000-000000000000';
    service.removeFriend(userId).subscribe();
    const req = http.expectOne(`/api/friends/${userId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
cd frontend && npm test -- --watch=false 2>&1 | grep -E "FAIL|Error|friends"
```
Expected: import error — `FriendsApiService` not found.

- [ ] **Step 3: Implement friends.models.ts**

```typescript
// frontend/src/app/core/friends/friends.models.ts
export interface FriendRequestDto {
  id: string;
  senderId: string;
  senderUsername: string;
  senderAvatarUrl: string | null;
  receiverId: string;
  receiverUsername: string;
  status: 'Pending' | 'Accepted' | 'Rejected';
  message: string | null;
  createdAt: string;
}

export interface FriendDto {
  friendshipId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  friendSince: string;
}
```

- [ ] **Step 4: Implement friends-api.service.ts**

```typescript
// frontend/src/app/core/friends/friends-api.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { FriendDto, FriendRequestDto } from './friends.models';

@Injectable({ providedIn: 'root' })
export class FriendsApiService {
  private readonly http = inject(HttpClient);

  getFriends(): Observable<FriendDto[]> {
    return this.http.get<FriendDto[]>('/api/friends');
  }

  getFriendRequests(): Observable<FriendRequestDto[]> {
    return this.http.get<FriendRequestDto[]>('/api/friends/requests');
  }

  sendFriendRequest(username: string, message?: string): Observable<void> {
    return this.http.post<void>('/api/friends/requests', { username, message });
  }

  acceptFriendRequest(id: string): Observable<void> {
    return this.http.post<void>(`/api/friends/requests/${id}/accept`, {});
  }

  rejectFriendRequest(id: string): Observable<void> {
    return this.http.post<void>(`/api/friends/requests/${id}/reject`, {});
  }

  removeFriend(userId: string): Observable<void> {
    return this.http.delete<void>(`/api/friends/${userId}`);
  }
}
```

- [ ] **Step 5: Run tests — confirm GREEN**

```bash
npm test -- --watch=false 2>&1 | tail -8
```
Expected: all tests pass (6 new + existing count).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/friends/
git commit -m "feat: add FriendsApiService with getFriends, getFriendRequests, sendFriendRequest, accept, reject, remove"
```

---

## Task 7: Angular DialogsApiService

**Files:**
- Create: `frontend/src/app/core/dialogs/dialogs.models.ts`
- Create: `frontend/src/app/core/dialogs/dialogs-api.service.ts`
- Create: `frontend/src/app/core/dialogs/dialogs-api.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/core/dialogs/dialogs-api.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { DialogsApiService } from './dialogs-api.service';

describe('DialogsApiService', () => {
  let service: DialogsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DialogsApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DialogsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getDialogs() sends GET /api/dialogs', () => {
    service.getDialogs().subscribe();
    const req = http.expectOne('/api/dialogs');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createDialog() sends POST /api/dialogs with userId body', () => {
    const userId = 'aaaaaaaa-0000-0000-0000-000000000000';
    service.createDialog(userId).subscribe();
    const req = http.expectOne('/api/dialogs');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId });
    req.flush({});
  });

  it('getDialog() sends GET /api/dialogs/{id}', () => {
    const id = 'bbbbbbbb-0000-0000-0000-000000000000';
    service.getDialog(id).subscribe();
    const req = http.expectOne(`/api/dialogs/${id}`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('getMessages() sends GET /api/dialogs/{id}/messages with limit param', () => {
    const id = 'cccccccc-0000-0000-0000-000000000000';
    service.getMessages(id).subscribe();
    const req = http.expectOne(r => r.url === `/api/dialogs/${id}/messages`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe('50');
    req.flush([]);
  });

  it('editMessage() sends PATCH /api/dm-messages/{id}', () => {
    const id = 'dddddddd-0000-0000-0000-000000000000';
    service.editMessage(id, 'updated').subscribe();
    const req = http.expectOne(`/api/dm-messages/${id}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ content: 'updated' });
    req.flush({});
  });

  it('deleteMessage() sends DELETE /api/dm-messages/{id}', () => {
    const id = 'eeeeeeee-0000-0000-0000-000000000000';
    service.deleteMessage(id).subscribe();
    const req = http.expectOne(`/api/dm-messages/${id}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
npm test -- --watch=false 2>&1 | grep "DialogsApiService"
```
Expected: import error.

- [ ] **Step 3: Implement dialogs.models.ts**

```typescript
// frontend/src/app/core/dialogs/dialogs.models.ts
export interface DialogDto {
  id: string;
  otherUserId: string;
  otherUsername: string;
  otherAvatarUrl: string | null;
  createdAt: string;
  isFrozen: boolean;
}
```

- [ ] **Step 4: Implement dialogs-api.service.ts**

```typescript
// frontend/src/app/core/dialogs/dialogs-api.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { DialogDto } from './dialogs.models';
import type { DialogMessageDto } from '../signalr/hub.models';

@Injectable({ providedIn: 'root' })
export class DialogsApiService {
  private readonly http = inject(HttpClient);

  getDialogs(): Observable<DialogDto[]> {
    return this.http.get<DialogDto[]>('/api/dialogs');
  }

  createDialog(userId: string): Observable<DialogDto> {
    return this.http.post<DialogDto>('/api/dialogs', { userId });
  }

  getDialog(id: string): Observable<DialogDto> {
    return this.http.get<DialogDto>(`/api/dialogs/${id}`);
  }

  getMessages(id: string, before?: string, limit = 50): Observable<DialogMessageDto[]> {
    let params = new HttpParams().set('limit', limit);
    if (before) params = params.set('before', before);
    return this.http.get<DialogMessageDto[]>(`/api/dialogs/${id}/messages`, { params });
  }

  editMessage(id: string, content: string): Observable<DialogMessageDto> {
    return this.http.patch<DialogMessageDto>(`/api/dm-messages/${id}`, { content });
  }

  deleteMessage(id: string): Observable<void> {
    return this.http.delete<void>(`/api/dm-messages/${id}`);
  }
}
```

- [ ] **Step 5: Run tests — confirm GREEN**

```bash
npm test -- --watch=false 2>&1 | tail -8
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/dialogs/
git commit -m "feat: add DialogsApiService with getDialogs, createDialog, getDialog, getMessages, editMessage, deleteMessage"
```

---

## Task 8: Wire FriendRequestsComponent

**Files:**
- Modify: `frontend/src/app/features/contacts/friend-requests/friend-requests.ts`
- Modify: `frontend/src/app/features/contacts/friend-requests/friend-requests.html`
- Modify: `frontend/src/app/features/contacts/friend-requests/friend-requests.spec.ts`

- [ ] **Step 1: Update the component TypeScript**

Replace the entire content of `frontend/src/app/features/contacts/friend-requests/friend-requests.ts`:

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FriendsApiService } from '../../../core/friends/friends-api.service';
import type { FriendRequestDto } from '../../../core/friends/friends.models';

@Component({
  selector: 'app-friend-requests',
  standalone: true,
  imports: [],
  templateUrl: './friend-requests.html',
  styleUrl: './friend-requests.scss',
})
export class FriendRequestsComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly friendsApi = inject(FriendsApiService);

  readonly user = this.authSession.user;
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly processingId = signal<string | null>(null);

  private readonly requests = signal<FriendRequestDto[]>([]);

  readonly incomingRequests = computed(() => {
    const userId = this.user()?.id;
    return this.requests().filter(r => r.receiverId === userId);
  });

  readonly outgoingRequests = computed(() => {
    const userId = this.user()?.id;
    return this.requests().filter(r => r.senderId === userId);
  });

  constructor() {
    this.loadRequests();
  }

  accept(id: string): void {
    if (this.processingId()) return;
    this.processingId.set(id);
    this.friendsApi.acceptFriendRequest(id)
      .pipe(finalize(() => this.processingId.set(null)))
      .subscribe({
        next: () => this.requests.update(list => list.filter(r => r.id !== id)),
        error: () => this.errorMessage.set('Unable to accept the request right now.'),
      });
  }

  reject(id: string): void {
    if (this.processingId()) return;
    this.processingId.set(id);
    this.friendsApi.rejectFriendRequest(id)
      .pipe(finalize(() => this.processingId.set(null)))
      .subscribe({
        next: () => this.requests.update(list => list.filter(r => r.id !== id)),
        error: () => this.errorMessage.set('Unable to decline the request right now.'),
      });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  private loadRequests(): void {
    this.isLoading.set(true);
    this.friendsApi.getFriendRequests()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: requests => this.requests.set(requests),
        error: () => this.errorMessage.set('Unable to load friend requests.'),
      });
  }
}
```

- [ ] **Step 2: Update the component HTML**

Replace the static incoming/outgoing request cards in `frontend/src/app/features/contacts/friend-requests/friend-requests.html` with data-driven content. Keep the overall page layout and design but replace the static cards. The left column (incoming) and right column (outgoing) sections should become:

Left column incoming requests section (replace the 3 static cards):
```html
<!-- Replace static incoming request cards with: -->
@if (isLoading()) {
  <div class="flex justify-center py-8">
    <span class="material-symbols-outlined text-2xl text-outline animate-spin">progress_activity</span>
  </div>
} @else if (errorMessage()) {
  <p class="text-error text-sm bg-error-container/20 border border-error/20 rounded-xl px-4 py-3">{{ errorMessage() }}</p>
} @else if (incomingRequests().length === 0) {
  <div class="text-center py-8 text-on-surface-variant text-sm">No pending incoming requests.</div>
} @else {
  @for (req of incomingRequests(); track req.id) {
    <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 flex flex-col gap-4">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-surface-container overflow-hidden shrink-0">
          @if (req.senderAvatarUrl) {
            <img [src]="req.senderAvatarUrl" class="w-full h-full object-cover" alt="" />
          } @else {
            <div class="w-full h-full flex items-center justify-center">
              <span class="material-symbols-outlined text-on-surface-variant">person</span>
            </div>
          }
        </div>
        <div class="flex-1">
          <p class="font-bold text-on-surface text-sm">{{ req.senderUsername }}</p>
          <p class="text-[11px] text-on-surface-variant mt-0.5">{{ formatDate(req.createdAt) }}</p>
          @if (req.message) {
            <p class="text-xs text-on-surface-variant mt-2 italic">{{ req.message }}</p>
          }
        </div>
      </div>
      <div class="flex gap-3">
        <button
          class="flex-1 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:bg-primary-dim transition-colors disabled:opacity-50"
          [disabled]="processingId() === req.id"
          (click)="accept(req.id)"
        >{{ processingId() === req.id ? '…' : 'Accept' }}</button>
        <button
          class="flex-1 py-2 bg-surface-container text-on-surface-variant text-sm font-bold rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-50"
          [disabled]="processingId() === req.id"
          (click)="reject(req.id)"
        >Decline</button>
      </div>
    </div>
  }
}
```

Right column outgoing sent requests section (replace the static items):
```html
<!-- Replace static outgoing items with: -->
@if (outgoingRequests().length === 0) {
  <p class="text-xs text-on-surface-variant">No pending sent requests.</p>
} @else {
  @for (req of outgoingRequests(); track req.id) {
    <div class="flex items-center gap-3 py-2 border-b border-surface-container last:border-0">
      <div class="w-8 h-8 rounded-full bg-surface-container overflow-hidden shrink-0">
        @if (req.senderAvatarUrl) {
          <img [src]="req.senderAvatarUrl" class="w-full h-full object-cover" alt="" />
        }
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-on-surface truncate">{{ req.receiverUsername }}</p>
        <p class="text-[10px] text-on-surface-variant">Pending · {{ formatDate(req.createdAt) }}</p>
      </div>
    </div>
  }
}
```

- [ ] **Step 3: Update the spec to provide HTTP services**

Replace `friend-requests.spec.ts` content:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { FriendRequestsComponent } from './friend-requests';

describe('FriendRequestsComponent', () => {
  let component: FriendRequestsComponent;
  let fixture: ComponentFixture<FriendRequestsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FriendRequestsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FriendRequestsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.isLoading()).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests — confirm GREEN**

```bash
npm test -- --watch=false 2>&1 | tail -8
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/contacts/friend-requests/
git commit -m "feat: wire FriendRequestsComponent to FriendsApiService — computed incoming/outgoing signals, accept/reject"
```

---

## Task 9: Wire ContactsHomeComponent

**Files:**
- Modify: `frontend/src/app/features/contacts/contacts-home/contacts-home.ts`
- Modify: `frontend/src/app/features/contacts/contacts-home/contacts-home.html`
- Modify: `frontend/src/app/features/contacts/contacts-home/contacts-home.spec.ts`

- [ ] **Step 1: Update the component TypeScript**

Replace the entire content of `frontend/src/app/features/contacts/contacts-home/contacts-home.ts`:

```typescript
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FriendsApiService } from '../../../core/friends/friends-api.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import type { FriendDto } from '../../../core/friends/friends.models';

@Component({
  selector: 'app-contacts-home',
  standalone: true,
  imports: [],
  templateUrl: './contacts-home.html',
  styleUrl: './contacts-home.scss',
})
export class ContactsHomeComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly friendsApi = inject(FriendsApiService);
  private readonly dialogsApi = inject(DialogsApiService);
  private readonly router = inject(Router);

  readonly user = this.authSession.user;
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly friends = signal<FriendDto[]>([]);
  readonly removingId = signal<string | null>(null);
  readonly openingChatId = signal<string | null>(null);

  constructor() {
    this.loadFriends();
  }

  removeFriend(userId: string): void {
    if (this.removingId()) return;
    this.removingId.set(userId);
    this.friendsApi.removeFriend(userId)
      .pipe(finalize(() => this.removingId.set(null)))
      .subscribe({
        next: () => this.friends.update(list => list.filter(f => f.userId !== userId)),
        error: () => this.errorMessage.set('Unable to remove friend right now.'),
      });
  }

  openChat(userId: string): void {
    if (this.openingChatId()) return;
    this.openingChatId.set(userId);
    this.dialogsApi.createDialog(userId)
      .pipe(finalize(() => this.openingChatId.set(null)))
      .subscribe({
        next: dialog => void this.router.navigateByUrl('/app/messages'),
        error: () => this.errorMessage.set('Unable to open chat right now.'),
      });
  }

  private loadFriends(): void {
    this.isLoading.set(true);
    this.friendsApi.getFriends()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: friends => this.friends.set(friends),
        error: () => this.errorMessage.set('Unable to load contacts.'),
      });
  }
}
```

- [ ] **Step 2: Update the HTML to wire the connections grid**

In `frontend/src/app/features/contacts/contacts-home/contacts-home.html`, find the "Connections Grid" section (the 4-card static grid) and replace the static cards with a data-driven grid:

```html
<!-- Replace the static 4-card grid with: -->
@if (isLoading()) {
  <div class="flex justify-center py-8">
    <span class="material-symbols-outlined text-2xl text-outline animate-spin">progress_activity</span>
  </div>
} @else if (errorMessage()) {
  <p class="text-error text-sm bg-error-container/20 border border-error/20 rounded-xl px-4 py-3">{{ errorMessage() }}</p>
} @else if (friends().length === 0) {
  <div class="text-center py-8 text-on-surface-variant text-sm">No connections yet. Send a friend request to connect.</div>
} @else {
  <div class="grid grid-cols-2 gap-4">
    @for (friend of friends(); track friend.userId) {
      <div class="group relative bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 hover:shadow-sm transition-shadow">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-full bg-surface-container overflow-hidden shrink-0">
            @if (friend.avatarUrl) {
              <img [src]="friend.avatarUrl" class="w-full h-full object-cover" alt="" />
            } @else {
              <div class="w-full h-full flex items-center justify-center">
                <span class="material-symbols-outlined text-on-surface-variant" style="font-size:1.25rem">person</span>
              </div>
            }
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-bold text-on-surface text-sm truncate">{{ friend.username }}</p>
          </div>
        </div>
        <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            class="flex-1 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:bg-primary-dim transition-colors disabled:opacity-50"
            [disabled]="openingChatId() === friend.userId"
            (click)="openChat(friend.userId)"
          >Chat</button>
          <button
            class="flex-1 py-1.5 bg-error-container text-on-error-container text-xs font-bold rounded-lg hover:bg-error hover:text-on-error transition-colors disabled:opacity-50"
            [disabled]="removingId() === friend.userId"
            (click)="removeFriend(friend.userId)"
          >Remove</button>
        </div>
      </div>
    }
  </div>
}
```

- [ ] **Step 3: Update the spec**

Replace `contacts-home.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ContactsHomeComponent } from './contacts-home';

describe('ContactsHomeComponent', () => {
  let component: ContactsHomeComponent;
  let fixture: ComponentFixture<ContactsHomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactsHomeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ContactsHomeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.isLoading()).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests — confirm GREEN**

```bash
npm test -- --watch=false 2>&1 | tail -8
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/contacts/contacts-home/
git commit -m "feat: wire ContactsHomeComponent — load friends, remove friend, open chat via DialogsApiService"
```

---

## Task 10: Wire DirectMessagesComponent

**Files:**
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts`
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.html`
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.spec.ts`

- [ ] **Step 1: Update the component TypeScript**

Replace the entire content of `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts`:

```typescript
import { Component, effect, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import type { DialogDto } from '../../../core/dialogs/dialogs.models';
import type { DialogMessageDto } from '../../../core/signalr/hub.models';

@Component({
  selector: 'app-direct-messages',
  standalone: true,
  imports: [],
  templateUrl: './direct-messages.html',
  styleUrl: './direct-messages.scss',
})
export class DirectMessagesComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly dialogsApi = inject(DialogsApiService);
  private readonly chat = inject(ChatService);

  readonly user = this.authSession.user;
  readonly isLoadingDialogs = signal(true);
  readonly isLoadingMessages = signal(false);
  readonly errorMessage = signal('');
  readonly dialogs = signal<DialogDto[]>([]);
  readonly selectedDialog = signal<DialogDto | null>(null);
  readonly messages = signal<DialogMessageDto[]>([]);
  readonly messageText = signal('');
  readonly isSending = signal(false);

  constructor() {
    this.loadDialogs();

    effect(() => {
      const event = this.chat.lastDmEvent();
      if (!event) return;
      const dialog = this.selectedDialog();
      if (!dialog) return;

      if (event.type === 'DirectMessageReceived' && event.payload.sender.id !== this.user()?.id) {
        const payloadDialogId = (event.payload as any)['dialogId'];
        if (payloadDialogId && payloadDialogId !== dialog.id) return;
        this.messages.update(msgs => [...msgs, event.payload]);
      } else if (event.type === 'DirectMessageEdited') {
        this.messages.update(msgs =>
          msgs.map(m => m.id === event.payload.id ? event.payload : m));
      } else if (event.type === 'DirectMessageDeleted') {
        this.messages.update(msgs =>
          msgs.map(m => m.id === event.payload.messageId
            ? { ...m, isDeleted: true, content: null } : m));
      }
    });
  }

  selectDialog(dialog: DialogDto): void {
    this.selectedDialog.set(dialog);
    this.loadMessages(dialog.id);
  }

  sendMessage(): void {
    const content = this.messageText().trim();
    const dialog  = this.selectedDialog();
    if (!content || !dialog || this.isSending()) return;

    this.isSending.set(true);
    void this.chat.sendDirectMessage(dialog.id, content, null, null)
      .then(() => { this.messageText.set(''); })
      .finally(() => { this.isSending.set(false); });
  }

  private loadDialogs(): void {
    this.isLoadingDialogs.set(true);
    this.dialogsApi.getDialogs()
      .pipe(finalize(() => this.isLoadingDialogs.set(false)))
      .subscribe({
        next: dialogs => this.dialogs.set(dialogs),
        error: () => this.errorMessage.set('Unable to load conversations.'),
      });
  }

  private loadMessages(dialogId: string): void {
    this.isLoadingMessages.set(true);
    this.dialogsApi.getMessages(dialogId)
      .pipe(finalize(() => this.isLoadingMessages.set(false)))
      .subscribe({
        next: messages => this.messages.set([...messages].reverse()),
        error: () => this.errorMessage.set('Unable to load messages.'),
      });
  }
}
```

Note: `getMessages()` returns newest-first (descending sort on server); we reverse to show oldest-first in the UI.

Note: `ChatService.lastDmEvent()` does not include `dialogId` in the `DirectMessageReceived` payload — the payload is `DialogMessageDto`. In a real scenario the `DialogMessageDto` from the SignalR hub does carry the dialog context implicitly (only events for dialogs the client is joined to). If `dialogId` filtering is needed, it should be added to the hub payload shape. For now, all DM events update the current selected dialog's message list.

Simplify the effect to:
```typescript
effect(() => {
  const event = this.chat.lastDmEvent();
  if (!event) return;

  if (event.type === 'DirectMessageReceived') {
    this.messages.update(msgs => [...msgs, event.payload]);
  } else if (event.type === 'DirectMessageEdited') {
    this.messages.update(msgs =>
      msgs.map(m => m.id === event.payload.id ? event.payload : m));
  } else if (event.type === 'DirectMessageDeleted') {
    this.messages.update(msgs =>
      msgs.map(m => m.id === event.payload.messageId
        ? { ...m, isDeleted: true, content: null } : m));
  }
});
```

- [ ] **Step 2: Update the HTML**

Replace the content of `frontend/src/app/features/dialogs/direct-messages/direct-messages.html` with:

```html
<div class="flex h-full overflow-hidden bg-surface">
  <!-- Pane 1: Dialog List -->
  <section class="w-80 flex flex-col bg-surface-container border-r border-surface-container-high shrink-0">
    <div class="p-6 border-b border-surface-container-high">
      <h2 class="text-lg font-bold text-on-surface mb-4">Messages</h2>
      <div class="relative">
        <input
          class="w-full bg-surface-container-low border-none rounded-lg text-sm px-4 py-2 focus:ring-1 focus:ring-primary/30"
          placeholder="Search conversations..."
          type="text"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      @if (isLoadingDialogs()) {
        <div class="flex justify-center py-8">
          <span class="material-symbols-outlined text-xl text-outline animate-spin">progress_activity</span>
        </div>
      } @else if (dialogs().length === 0) {
        <div class="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
          <span class="material-symbols-outlined text-3xl text-outline">chat_bubble</span>
          <p class="text-xs text-on-surface-variant">No conversations yet.</p>
        </div>
      } @else {
        @for (dialog of dialogs(); track dialog.id) {
          <button
            class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-lowest transition-colors text-left"
            [class.bg-surface-container-lowest]="selectedDialog()?.id === dialog.id"
            [class.shadow-sm]="selectedDialog()?.id === dialog.id"
            (click)="selectDialog(dialog)"
          >
            <div class="w-10 h-10 rounded-full bg-surface-container-high overflow-hidden shrink-0 flex items-center justify-center">
              @if (dialog.otherAvatarUrl) {
                <img [src]="dialog.otherAvatarUrl" class="w-full h-full object-cover" alt="" />
              } @else {
                <span class="material-symbols-outlined text-on-surface-variant" style="font-size:1.25rem">person</span>
              }
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-on-surface truncate">{{ dialog.otherUsername }}</p>
              @if (dialog.isFrozen) {
                <p class="text-[10px] text-error">Conversation frozen</p>
              }
            </div>
          </button>
        }
      }
    </div>
  </section>

  <!-- Pane 2: Message Thread -->
  <section class="flex-1 flex flex-col overflow-hidden">
    @if (!selectedDialog()) {
      <div class="flex-1 flex items-center justify-center text-on-surface-variant">
        <div class="text-center">
          <span class="material-symbols-outlined text-4xl text-outline block mb-2">chat</span>
          <p class="text-sm">Select a conversation to start chatting</p>
        </div>
      </div>
    } @else {
      <!-- Header -->
      <div class="h-16 bg-surface-container border-b border-surface-container-high flex items-center px-6 gap-3 shrink-0">
        <div class="w-8 h-8 rounded-full bg-surface-container-high overflow-hidden flex items-center justify-center">
          @if (selectedDialog()!.otherAvatarUrl) {
            <img [src]="selectedDialog()!.otherAvatarUrl" class="w-full h-full object-cover" alt="" />
          } @else {
            <span class="material-symbols-outlined text-on-surface-variant" style="font-size:1rem">person</span>
          }
        </div>
        <h3 class="font-bold text-on-surface text-sm">{{ selectedDialog()!.otherUsername }}</h3>
        @if (selectedDialog()!.isFrozen) {
          <span class="ml-auto text-[10px] font-bold uppercase tracking-widest text-error bg-error-container/30 px-2 py-1 rounded-full">Frozen</span>
        }
      </div>

      <!-- Messages -->
      <div class="flex-1 overflow-y-auto p-6 space-y-3" data-testid="dm-messages">
        @if (isLoadingMessages()) {
          <div class="flex justify-center py-8">
            <span class="material-symbols-outlined text-xl text-outline animate-spin">progress_activity</span>
          </div>
        } @else if (messages().length === 0) {
          <div class="text-center py-12 text-on-surface-variant text-sm">No messages yet. Say hello!</div>
        } @else {
          @for (msg of messages(); track msg.id) {
            @if (!msg.isDeleted) {
              <div [class]="msg.sender.id === user()?.id ? 'flex justify-end' : 'flex'">
                <div
                  class="max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl text-sm"
                  [class]="msg.sender.id === user()?.id
                    ? 'bg-primary text-on-primary rounded-br-sm'
                    : 'bg-surface-container-lowest text-on-surface rounded-bl-sm'"
                >
                  <p>{{ msg.content }}</p>
                  @if (msg.editedAt) {
                    <p class="text-[9px] opacity-60 mt-0.5">edited</p>
                  }
                </div>
              </div>
            } @else {
              <div [class]="msg.sender.id === user()?.id ? 'flex justify-end' : 'flex'">
                <div class="px-4 py-2 rounded-2xl text-xs text-on-surface-variant italic bg-surface-container">
                  Message deleted
                </div>
              </div>
            }
          }
        }
      </div>

      <!-- Compose -->
      <div class="p-4 border-t border-surface-container-high shrink-0">
        @if (errorMessage()) {
          <p class="text-error text-xs mb-2">{{ errorMessage() }}</p>
        }
        <div class="flex gap-2 items-end">
          <textarea
            class="flex-1 bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm text-on-surface resize-none focus:ring-1 focus:ring-primary/30 outline-none"
            data-testid="dm-message-input"
            placeholder="Type a message..."
            rows="1"
            [value]="messageText()"
            [disabled]="selectedDialog()!.isFrozen || isSending()"
            (input)="messageText.set($any($event.target).value)"
            (keydown.enter)="$event.preventDefault(); sendMessage()"
          ></textarea>
          <button
            class="px-4 py-3 bg-primary text-on-primary text-sm font-bold rounded-xl hover:bg-primary-dim transition-colors disabled:opacity-50"
            [disabled]="isSending() || !messageText().trim() || selectedDialog()!.isFrozen"
            (click)="sendMessage()"
          >
            <span class="material-symbols-outlined" style="font-size:1.25rem">send</span>
          </button>
        </div>
      </div>
    }
  </section>

  <!-- Pane 3: Contact Info -->
  @if (selectedDialog()) {
    <section class="w-72 flex flex-col bg-surface-container border-l border-surface-container-high shrink-0 overflow-y-auto p-6">
      <div class="flex flex-col items-center gap-4 text-center">
        <div class="w-20 h-20 rounded-full bg-surface-container-high overflow-hidden flex items-center justify-center">
          @if (selectedDialog()!.otherAvatarUrl) {
            <img [src]="selectedDialog()!.otherAvatarUrl" class="w-full h-full object-cover" alt="" />
          } @else {
            <span class="material-symbols-outlined text-on-surface-variant text-4xl">person</span>
          }
        </div>
        <div>
          <h3 class="font-bold text-on-surface">{{ selectedDialog()!.otherUsername }}</h3>
        </div>
      </div>
    </section>
  }
</div>
```

- [ ] **Step 3: Update the spec**

Replace `direct-messages.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DirectMessagesComponent } from './direct-messages';

describe('DirectMessagesComponent', () => {
  let component: DirectMessagesComponent;
  let fixture: ComponentFixture<DirectMessagesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DirectMessagesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(DirectMessagesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with no selected dialog', () => {
    expect(component.selectedDialog()).toBeNull();
  });

  it('should start loading dialogs', () => {
    expect(component.isLoadingDialogs()).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests — confirm GREEN**

```bash
npm test -- --watch=false 2>&1 | tail -10
```
Expected: all tests pass (existing count + 3 new for this component, plus 2 extra for contacts/friend-requests earlier).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/dialogs/direct-messages/
git commit -m "feat: wire DirectMessagesComponent — dialog list, message history, real-time DMs via ChatService"
```

---

## Self-Review

### Spec coverage check (AGENT.md §9)

| Endpoint | Covered by task |
|----------|----------------|
| GET /friends | Task 2 |
| GET /friends/requests | Task 2 |
| POST /friends/requests | Task 2 |
| POST /friends/requests/{id}/accept | Task 2 |
| POST /friends/requests/{id}/reject | Task 2 |
| DELETE /friends/{userId} | Task 2 |
| GET /blocks | Task 3 |
| POST /blocks | Task 3 |
| DELETE /blocks/{userId} | Task 3 |
| GET /dialogs | Task 4 |
| POST /dialogs | Task 4 |
| GET /dialogs/{id} | Task 4 |
| GET /dialogs/{id}/messages | Task 4 |
| PATCH /dm-messages/{id} | Task 4 |
| DELETE /dm-messages/{id} | Task 4 |

All 15 endpoints covered. Files, Notifications already implemented.

### Type consistency check

- `FriendDto.userId` (C#) → `FriendDto.userId` (TS) ✓
- `FriendRequestDto.senderUsername` (C#) → `FriendRequestDto.senderUsername` (TS) ✓
- `DialogDto.isFrozen` (C#) → `DialogDto.isFrozen` (TS) ✓
- `DialogsApiService.getMessages()` returns `DialogMessageDto[]` which matches `hub.models.ts` type ✓
- `ChatService.lastDmEvent()` emits `DmChatEvent` with `payload: DialogMessageDto` — DirectMessagesComponent's effect reads `event.payload.sender.id` ✓

---

Plan complete and saved to `docs/superpowers/plans/2026-04-18-phase4e-friends-blocks-dialogs.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
