# Phase 4a — Rooms REST + Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all REST endpoints for Rooms, Messages, Users, Notifications, and Invitations; wire Redis presence/unread stores; fix incomplete Message entities; create xUnit test projects.

**Architecture:** Clean Architecture: ports in Application, implementations in Infrastructure, endpoints in API. All backend tasks follow Red→Green→Refactor TDD. No SignalR hub code in this plan — hubs are Phase 4b.

**Tech Stack:** .NET 10 Minimal APIs, EF Core 10 + Npgsql, Redis 7 (StackExchange.Redis), xUnit 2.x, NSubstitute, Testcontainers.

**Prerequisite:** Phase 3 [VERIFIED] — JWT auth, Argon2id, Redis session gate are complete (commits up to `08b0ffe`).

> **⚠ CRITICAL EXECUTION ORDER:** Task 10 (entity fixes) MUST be executed BEFORE Tasks 7, 8, and 9. The endpoint code in those tasks references `ReadMarker.ContextType` as `string` and `RoomBan.BannedUserId` — properties that only exist after Task 10's entity rewrites. Recommended order: **1 → 2 → 3 → 4 → 5 → 10 → 6 → 7 → 8 → 9**.
>
> **ContextSequences.ContextType is a `ContextType` enum** (not `string`). When creating ContextSequences rows in Task 7, use `ContextType.Room` (the enum value) and add `using ChatHerder.Domain.Enums;`. When building Redis unread keys, use `.ToString().ToLowerInvariant()` to get `"room"` or `"dialog"` — see AGENT.md §11 note.

---

## File Map

### Create
- `tests/ChatHerder.Unit.Tests/ChatHerder.Unit.Tests.csproj`
- `tests/ChatHerder.Unit.Tests/Endpoints/RoomEndpointsTests.cs`
- `tests/ChatHerder.Unit.Tests/Endpoints/MessageEndpointsTests.cs`
- `tests/ChatHerder.Integration.Tests/ChatHerder.Integration.Tests.csproj`
- `tests/ChatHerder.Integration.Tests/Infrastructure/RedisUnreadStoreTests.cs`
- `src/ChatHerder.Application/Ports/IPresenceStore.cs`
- `src/ChatHerder.Application/Ports/IUnreadStore.cs`
- `src/ChatHerder.Application/DTOs/RoomDtos.cs`
- `src/ChatHerder.Application/DTOs/MessageDtos.cs`
- `src/ChatHerder.Infrastructure/Cache/RedisPresenceStore.cs`
- `src/ChatHerder.Infrastructure/Cache/RedisUnreadStore.cs`
- `src/ChatHerder.Infrastructure/Services/PresenceMonitorService.cs`
- `src/ChatHerder.API/Endpoints/UserEndpoints.cs`
- `src/ChatHerder.API/Endpoints/RoomEndpoints.cs`
- `src/ChatHerder.API/Endpoints/RoomInvitationEndpoints.cs`
- `src/ChatHerder.API/Endpoints/MessageEndpoints.cs`
- `src/ChatHerder.API/Endpoints/NotificationEndpoints.cs`

### Modify
- `src/ChatHerder.Domain/Entities/Message.cs` — add AttachmentId, EditedAt, DeletedByUserId
- `src/ChatHerder.Domain/Entities/PersonalDialogMessage.cs` — add AttachmentId, EditedAt
- `src/ChatHerder.Infrastructure/InfrastructureExtensions.cs` — register IPresenceStore, IUnreadStore, PresenceMonitorService
- `src/ChatHerder.API/Program.cs` — map new endpoint groups
- `src/ChatHerder.Infrastructure/Migrations/` — new migration for entity changes

---

## Task 1: Create xUnit Test Projects

**Files:**
- Create: `tests/ChatHerder.Unit.Tests/ChatHerder.Unit.Tests.csproj`
- Create: `tests/ChatHerder.Integration.Tests/ChatHerder.Integration.Tests.csproj`

- [ ] **Step 1: Scaffold both projects and wire into solution**

```bash
dotnet new xunit -o tests/ChatHerder.Unit.Tests --framework net10.0
dotnet new xunit -o tests/ChatHerder.Integration.Tests --framework net10.0
dotnet sln add tests/ChatHerder.Unit.Tests/ChatHerder.Unit.Tests.csproj
dotnet sln add tests/ChatHerder.Integration.Tests/ChatHerder.Integration.Tests.csproj
```

- [ ] **Step 2: Add packages and project references**

```bash
# Unit test project
dotnet add tests/ChatHerder.Unit.Tests/ package NSubstitute
dotnet add tests/ChatHerder.Unit.Tests/ reference src/ChatHerder.Domain/ChatHerder.Domain.csproj
dotnet add tests/ChatHerder.Unit.Tests/ reference src/ChatHerder.Application/ChatHerder.Application.csproj
dotnet add tests/ChatHerder.Unit.Tests/ reference src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj
dotnet add tests/ChatHerder.Unit.Tests/ reference src/ChatHerder.API/ChatHerder.API.csproj
dotnet add tests/ChatHerder.Unit.Tests/ package Microsoft.AspNetCore.Http.Abstractions
dotnet add tests/ChatHerder.Unit.Tests/ package Microsoft.AspNetCore.Mvc.Testing

# Integration test project
dotnet add tests/ChatHerder.Integration.Tests/ package NSubstitute
dotnet add tests/ChatHerder.Integration.Tests/ package Testcontainers.PostgreSql
dotnet add tests/ChatHerder.Integration.Tests/ package Testcontainers.Redis
dotnet add tests/ChatHerder.Integration.Tests/ reference src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj
dotnet add tests/ChatHerder.Integration.Tests/ reference src/ChatHerder.API/ChatHerder.API.csproj
dotnet add tests/ChatHerder.Integration.Tests/ package Microsoft.AspNetCore.Mvc.Testing
```

- [ ] **Step 3: Delete the default `UnitTest1.cs` files**

```bash
rm tests/ChatHerder.Unit.Tests/UnitTest1.cs
rm tests/ChatHerder.Integration.Tests/UnitTest1.cs
```

- [ ] **Step 4: Write a smoke test to confirm RED (no implementation exists yet)**

Create `tests/ChatHerder.Unit.Tests/Smoke/ScaffoldTest.cs`:

```csharp
namespace ChatHerder.Unit.Tests.Smoke;

public sealed class ScaffoldTest
{
    [Fact]
    public void TestProjectCompiles()
    {
        // If this test runs, the xUnit scaffold is wired correctly.
        Assert.True(true);
    }
}
```

- [ ] **Step 5: Run tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --logger "console;verbosity=minimal"
```

Expected: `Passed: 1, Failed: 0`

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "feat: scaffold Unit and Integration xUnit test projects"
```

---

## Task 2: Fix Incomplete Message Entities + New Migration

The `Message` and `PersonalDialogMessage` entities are missing `AttachmentId`, `EditedAt`, and `DeletedByUserId` fields required by the spec. A new EF Core migration is needed before any message endpoint can be built.

**Files:**
- Modify: `src/ChatHerder.Domain/Entities/Message.cs`
- Modify: `src/ChatHerder.Domain/Entities/PersonalDialogMessage.cs`
- Create: new EF Core migration

- [ ] **Step 1: Write a failing test verifying the missing properties exist**

Create `tests/ChatHerder.Unit.Tests/Domain/MessageEntityTests.cs`:

```csharp
using ChatHerder.Domain.Entities;

namespace ChatHerder.Unit.Tests.Domain;

public sealed class MessageEntityTests
{
    [Fact]
    public void Message_HasAttachmentId_Property()
    {
        var prop = typeof(Message).GetProperty("AttachmentId");
        Assert.NotNull(prop);
        Assert.Equal(typeof(Guid?), prop.PropertyType);
    }

    [Fact]
    public void Message_HasEditedAt_Property()
    {
        var prop = typeof(Message).GetProperty("EditedAt");
        Assert.NotNull(prop);
        Assert.Equal(typeof(DateTime?), prop.PropertyType);
    }

    [Fact]
    public void Message_HasDeletedByUserId_Property()
    {
        var prop = typeof(Message).GetProperty("DeletedByUserId");
        Assert.NotNull(prop);
        Assert.Equal(typeof(Guid?), prop.PropertyType);
    }

    [Fact]
    public void PersonalDialogMessage_HasAttachmentId_Property()
    {
        var prop = typeof(PersonalDialogMessage).GetProperty("AttachmentId");
        Assert.NotNull(prop);
        Assert.Equal(typeof(Guid?), prop.PropertyType);
    }

    [Fact]
    public void PersonalDialogMessage_HasEditedAt_Property()
    {
        var prop = typeof(PersonalDialogMessage).GetProperty("EditedAt");
        Assert.NotNull(prop);
        Assert.Equal(typeof(DateTime?), prop.PropertyType);
    }
}
```

- [ ] **Step 2: Run to confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "Domain" --logger "console;verbosity=minimal"
```

Expected: `Failed: 5` (properties do not exist yet)

- [ ] **Step 3: Update `src/ChatHerder.Domain/Entities/Message.cs`**

```csharp
namespace ChatHerder.Domain.Entities;

public sealed class Message
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid AuthorId { get; init; }
    public required string Content { get; set; }
    public required long SequenceNumber { get; init; }
    public Guid? ReplyToMessageId { get; init; }
    public Guid? AttachmentId { get; init; }
    public DateTime SentAt { get; init; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedByUserId { get; set; }

    public Room Room { get; init; } = null!;
    public User Author { get; init; } = null!;
    public Message? ReplyToMessage { get; init; }
    public Attachment? Attachment { get; init; }
}
```

- [ ] **Step 4: Update `src/ChatHerder.Domain/Entities/PersonalDialogMessage.cs`**

```csharp
namespace ChatHerder.Domain.Entities;

public sealed class PersonalDialogMessage
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid DialogId { get; init; }
    public required Guid AuthorId { get; init; }
    public required string Content { get; set; }
    public required long SequenceNumber { get; init; }
    public Guid? ReplyToMessageId { get; init; }
    public Guid? AttachmentId { get; init; }
    public DateTime SentAt { get; init; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public DateTime? DeletedAt { get; set; }

    public PersonalDialog Dialog { get; init; } = null!;
    public User Author { get; init; } = null!;
    public PersonalDialogMessage? ReplyToMessage { get; init; }
    public Attachment? Attachment { get; init; }
}
```

- [ ] **Step 5: Add FK configuration to AppDbContext for new fields**

In `src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs`, find the Messages configuration block and add after the existing lines:

```csharp
// Add inside m.Entity<Message>(e => { ... }):
e.Property(m => m.AttachmentId);
e.Property(m => m.EditedAt);
e.Property(m => m.DeletedByUserId);
e.HasOne(m => m.Attachment).WithMany().HasForeignKey(m => m.AttachmentId).OnDelete(DeleteBehavior.SetNull);
e.HasOne<User>().WithMany().HasForeignKey(m => m.DeletedByUserId).OnDelete(DeleteBehavior.SetNull);

// Add inside m.Entity<PersonalDialogMessage>(e => { ... }):
e.Property(m => m.AttachmentId);
e.Property(m => m.EditedAt);
e.HasOne(m => m.Attachment).WithMany().HasForeignKey(m => m.AttachmentId).OnDelete(DeleteBehavior.SetNull);
```

- [ ] **Step 6: Generate the migration**

```bash
dotnet ef migrations add AddMessageEditDeleteFields \
  --project src/ChatHerder.Infrastructure \
  --startup-project src/ChatHerder.API \
  --output-dir Migrations
```

Expected: new migration file created in `src/ChatHerder.Infrastructure/Migrations/`

- [ ] **Step 7: Run tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "Domain" --logger "console;verbosity=minimal"
```

Expected: `Passed: 5, Failed: 0`

- [ ] **Step 8: Verify solution builds**

```bash
dotnet build ChatHerder.sln -c Debug
```

Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add src/ChatHerder.Domain/Entities/Message.cs \
        src/ChatHerder.Domain/Entities/PersonalDialogMessage.cs \
        src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs \
        src/ChatHerder.Infrastructure/Migrations/ \
        tests/ChatHerder.Unit.Tests/Domain/MessageEntityTests.cs
git commit -m "feat: add AttachmentId/EditedAt/DeletedByUserId to Message entities + migration"
```

---

## Task 3: Application Ports — IPresenceStore + IUnreadStore + Shared DTOs

**Files:**
- Create: `src/ChatHerder.Application/Ports/IPresenceStore.cs`
- Create: `src/ChatHerder.Application/Ports/IUnreadStore.cs`
- Create: `src/ChatHerder.Application/DTOs/RoomDtos.cs`
- Create: `src/ChatHerder.Application/DTOs/MessageDtos.cs`

- [ ] **Step 1: Write a failing unit test for IPresenceStore contract**

Create `tests/ChatHerder.Unit.Tests/Ports/PresenceStoreContractTest.cs`:

```csharp
using ChatHerder.Application.Ports;
using NSubstitute;

namespace ChatHerder.Unit.Tests.Ports;

public sealed class PresenceStoreContractTest
{
    [Fact]
    public async Task IPresenceStore_GetStatusAsync_ReturnsNull_WhenNotSet()
    {
        var store = Substitute.For<IPresenceStore>();
        store.GetStatusAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns((string?)null);

        var result = await store.GetStatusAsync(Guid.NewGuid());

        Assert.Null(result);
    }
}
```

- [ ] **Step 2: Run to confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "Ports" --logger "console;verbosity=minimal"
```

Expected: FAIL — `IPresenceStore` not found

- [ ] **Step 3: Create `src/ChatHerder.Application/Ports/IPresenceStore.cs`**

```csharp
namespace ChatHerder.Application.Ports;

public interface IPresenceStore
{
    Task RegisterTabAsync(Guid userId, string connId, CancellationToken ct = default);
    Task UnregisterTabAsync(Guid userId, string connId, CancellationToken ct = default);
    Task<long> GetTabCountAsync(Guid userId, CancellationToken ct = default);
    Task SetStatusAsync(Guid userId, string status, CancellationToken ct = default);
    Task<string?> GetStatusAsync(Guid userId, CancellationToken ct = default);
    Task SetAfkTabAsync(Guid userId, string connId, CancellationToken ct = default);
    Task ClearAfkTabAsync(Guid userId, string connId, CancellationToken ct = default);
    Task<bool> IsAllTabsAfkAsync(Guid userId, CancellationToken ct = default);
    Task<IReadOnlyList<string>> GetConnectionIdsAsync(Guid userId, CancellationToken ct = default);
    Task SetConnUserAsync(string connId, Guid userId, CancellationToken ct = default);
    Task SetConnSessionAsync(string connId, Guid sessionId, CancellationToken ct = default);
    Task<IReadOnlyList<(string ConnId, double Score)>> GetStaleTabsAsync(Guid userId, double threshold, CancellationToken ct = default);
    Task RemoveStaleTabAsync(Guid userId, string connId, CancellationToken ct = default);
    Task AddToActiveUsersAsync(Guid userId, CancellationToken ct = default);
    Task RemoveFromActiveUsersAsync(Guid userId, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> GetActiveUsersAsync(CancellationToken ct = default);
}
```

- [ ] **Step 4: Create `src/ChatHerder.Application/Ports/IUnreadStore.cs`**

```csharp
namespace ChatHerder.Application.Ports;

public interface IUnreadStore
{
    Task IncrementAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default);
    Task<long> GetCountAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default);
    Task ClearAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default);
    Task SetAsync(Guid userId, string contextType, Guid contextId, long count, CancellationToken ct = default);
    Task<IReadOnlyList<(string ContextType, Guid ContextId, long Count)>> GetAllAsync(Guid userId, IReadOnlyList<(string type, Guid id)> contexts, CancellationToken ct = default);
}
```

- [ ] **Step 5: Create `src/ChatHerder.Application/DTOs/RoomDtos.cs`**

```csharp
namespace ChatHerder.Application.DTOs;

public sealed record CreateRoomRequest(string Name, string? Description, string Visibility);
public sealed record UpdateRoomRequest(string? Name, string? Description, string? Visibility);

public sealed record RoomDto(
    Guid Id,
    string Name,
    string? Description,
    string Visibility,
    Guid OwnerId,
    DateTime CreatedAt,
    int MemberCount,
    string? CallerRole);        // "Owner"|"Admin"|"Member"|null (not a member)

public sealed record RoomMemberDto(
    Guid UserId,
    string Username,
    string? AvatarUrl,
    string Role,
    DateTime JoinedAt,
    string PresenceStatus);     // "online"|"afk"|"offline"

public sealed record RoomBanDto(
    Guid BannedUserId,
    string BannedUsername,
    Guid BannedByUserId,
    string BannedByUsername,
    string? Reason,
    DateTime CreatedAt);

public sealed record RoomInvitationDto(
    Guid Id,
    Guid RoomId,
    string RoomName,
    Guid InvitedByUserId,
    string InvitedByUsername,
    Guid InvitedUserId,
    string InvitedUsername,
    string Status,
    DateTime CreatedAt);

public sealed record BanMemberRequest(string? Reason);
public sealed record InviteUserRequest(string Username);
```

- [ ] **Step 6: Create `src/ChatHerder.Application/DTOs/MessageDtos.cs`**

```csharp
namespace ChatHerder.Application.DTOs;

public sealed record UserSummary(Guid Id, string Username, string? AvatarUrl);

public sealed record AttachmentDto(
    Guid Id,
    string FileName,
    string ContentType,
    long SizeBytes,
    string? Comment);

public sealed record MessageDto(
    Guid Id,
    long SequenceNumber,
    string? Content,            // null when IsDeleted=true
    UserSummary Sender,
    DateTime SentAt,
    DateTime? EditedAt,
    bool IsDeleted,
    MessageDto? ReplyTo,        // embedded snapshot at send time
    AttachmentDto? Attachment);

public sealed record DialogMessageDto(
    Guid Id,
    long SequenceNumber,
    string? Content,
    UserSummary Sender,
    DateTime SentAt,
    DateTime? EditedAt,
    bool IsDeleted,
    DialogMessageDto? ReplyTo,
    AttachmentDto? Attachment);

public sealed record EditMessageRequest(string Content);
public sealed record SendMessageRequest(string Content, Guid? ReplyToId, Guid? AttachmentId);

public sealed record UnreadContextDto(string ContextType, Guid ContextId, long Count);
```

- [ ] **Step 7: Run to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "Ports" --logger "console;verbosity=minimal"
dotnet build ChatHerder.sln -c Debug
```

Expected: tests Passed: 1; build 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/ChatHerder.Application/Ports/IPresenceStore.cs \
        src/ChatHerder.Application/Ports/IUnreadStore.cs \
        src/ChatHerder.Application/DTOs/RoomDtos.cs \
        src/ChatHerder.Application/DTOs/MessageDtos.cs \
        tests/ChatHerder.Unit.Tests/Ports/
git commit -m "feat: add IPresenceStore, IUnreadStore ports and Phase 4 DTOs"
```

---

## Task 4: RedisPresenceStore + RedisUnreadStore

**Files:**
- Create: `src/ChatHerder.Infrastructure/Cache/RedisPresenceStore.cs`
- Create: `src/ChatHerder.Infrastructure/Cache/RedisUnreadStore.cs`

- [ ] **Step 1: Write failing integration test for RedisUnreadStore**

Create `tests/ChatHerder.Integration.Tests/Infrastructure/RedisUnreadStoreTests.cs`:

```csharp
using ChatHerder.Infrastructure.Cache;
using StackExchange.Redis;
using Testcontainers.Redis;

namespace ChatHerder.Integration.Tests.Infrastructure;

public sealed class RedisUnreadStoreTests : IAsyncLifetime
{
    private readonly RedisContainer _redis = new RedisBuilder().Build();
    private IConnectionMultiplexer _mux = null!;

    public async Task InitializeAsync()
    {
        await _redis.StartAsync();
        _mux = await ConnectionMultiplexer.ConnectAsync(_redis.GetConnectionString());
    }

    public async Task DisposeAsync()
    {
        _mux.Dispose();
        await _redis.DisposeAsync();
    }

    [Fact]
    public async Task IncrementAsync_ThenGetCountAsync_ReturnsCorrectCount()
    {
        var store = new RedisUnreadStore(_mux);
        var userId = Guid.NewGuid();
        var roomId = Guid.NewGuid();

        await store.IncrementAsync(userId, "room", roomId);
        await store.IncrementAsync(userId, "room", roomId);
        var count = await store.GetCountAsync(userId, "room", roomId);

        Assert.Equal(2, count);
    }

    [Fact]
    public async Task ClearAsync_ResetsCountToZero()
    {
        var store = new RedisUnreadStore(_mux);
        var userId = Guid.NewGuid();
        var roomId = Guid.NewGuid();

        await store.IncrementAsync(userId, "room", roomId);
        await store.ClearAsync(userId, "room", roomId);
        var count = await store.GetCountAsync(userId, "room", roomId);

        Assert.Equal(0, count);
    }
}
```

- [ ] **Step 2: Run to confirm RED**

```bash
dotnet test tests/ChatHerder.Integration.Tests/ --filter "RedisUnread" --logger "console;verbosity=minimal"
```

Expected: FAIL — `RedisUnreadStore` not found

- [ ] **Step 3: Create `src/ChatHerder.Infrastructure/Cache/RedisPresenceStore.cs`**

```csharp
using ChatHerder.Application.Ports;
using StackExchange.Redis;

namespace ChatHerder.Infrastructure.Cache;

public sealed class RedisPresenceStore(IConnectionMultiplexer redis) : IPresenceStore
{
    private IDatabase Db => redis.GetDatabase();

    // Key helpers
    private static RedisKey TabsKey(Guid userId)    => $"presence:tabs:{userId}";
    private static RedisKey AfkKey(Guid userId)     => $"afk_tabs:{userId}";
    private static RedisKey StatusKey(Guid userId)  => $"presence:status:{userId}";
    private static RedisKey ConnUserKey(string c)   => $"presence:conn:{c}";
    private static RedisKey ConnSessionKey(string c)=> $"presence:session:{c}";
    private static RedisKey ActiveUsersKey()        => "active:users";

    public async Task RegisterTabAsync(Guid userId, string connId, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        await Db.SortedSetAddAsync(TabsKey(userId), connId, now);
    }

    public async Task UnregisterTabAsync(Guid userId, string connId, CancellationToken ct = default)
    {
        await Db.SortedSetRemoveAsync(TabsKey(userId), connId);
        await Db.SetRemoveAsync(AfkKey(userId), connId);
    }

    public async Task<long> GetTabCountAsync(Guid userId, CancellationToken ct = default)
        => await Db.SortedSetLengthAsync(TabsKey(userId));

    public async Task SetStatusAsync(Guid userId, string status, CancellationToken ct = default)
        => await Db.StringSetAsync(StatusKey(userId), status, TimeSpan.FromSeconds(90));

    public async Task<string?> GetStatusAsync(Guid userId, CancellationToken ct = default)
        => (string?)await Db.StringGetAsync(StatusKey(userId));

    public async Task SetAfkTabAsync(Guid userId, string connId, CancellationToken ct = default)
        => await Db.SetAddAsync(AfkKey(userId), connId);

    public async Task ClearAfkTabAsync(Guid userId, string connId, CancellationToken ct = default)
        => await Db.SetRemoveAsync(AfkKey(userId), connId);

    public async Task<bool> IsAllTabsAfkAsync(Guid userId, CancellationToken ct = default)
    {
        var tabCount = await Db.SortedSetLengthAsync(TabsKey(userId));
        if (tabCount == 0) return false;
        var afkCount = await Db.SetLengthAsync(AfkKey(userId));
        return afkCount >= tabCount;
    }

    public async Task<IReadOnlyList<string>> GetConnectionIdsAsync(Guid userId, CancellationToken ct = default)
    {
        var members = await Db.SortedSetRangeByRankAsync(TabsKey(userId));
        return members.Select(m => (string)m!).ToList();
    }

    public async Task SetConnUserAsync(string connId, Guid userId, CancellationToken ct = default)
        => await Db.StringSetAsync(ConnUserKey(connId), userId.ToString(), TimeSpan.FromSeconds(70));

    public async Task SetConnSessionAsync(string connId, Guid sessionId, CancellationToken ct = default)
        => await Db.StringSetAsync(ConnSessionKey(connId), sessionId.ToString(), TimeSpan.FromSeconds(70));

    public async Task<IReadOnlyList<(string ConnId, double Score)>> GetStaleTabsAsync(
        Guid userId, double threshold, CancellationToken ct = default)
    {
        var entries = await Db.SortedSetRangeByScoreWithScoresAsync(
            TabsKey(userId), start: 0, stop: threshold);
        return entries.Select(e => ((string)e.Element!, e.Score)).ToList();
    }

    public async Task RemoveStaleTabAsync(Guid userId, string connId, CancellationToken ct = default)
    {
        await Db.SortedSetRemoveAsync(TabsKey(userId), connId);
        await Db.SetRemoveAsync(AfkKey(userId), connId);
    }

    public async Task AddToActiveUsersAsync(Guid userId, CancellationToken ct = default)
        => await Db.SetAddAsync(ActiveUsersKey(), userId.ToString());

    public async Task RemoveFromActiveUsersAsync(Guid userId, CancellationToken ct = default)
        => await Db.SetRemoveAsync(ActiveUsersKey(), userId.ToString());

    public async Task<IReadOnlyList<Guid>> GetActiveUsersAsync(CancellationToken ct = default)
    {
        var members = await Db.SetMembersAsync(ActiveUsersKey());
        return members.Select(m => Guid.Parse((string)m!)).ToList();
    }
}
```

- [ ] **Step 4: Create `src/ChatHerder.Infrastructure/Cache/RedisUnreadStore.cs`**

```csharp
using ChatHerder.Application.Ports;
using StackExchange.Redis;

namespace ChatHerder.Infrastructure.Cache;

public sealed class RedisUnreadStore(IConnectionMultiplexer redis) : IUnreadStore
{
    private IDatabase Db => redis.GetDatabase();

    // contextType is always lowercase ("room" or "dialog") — AGENT.md §11 note
    private static RedisKey Key(Guid userId, string contextType, Guid contextId)
        => $"unread:{userId}:{contextType}:{contextId}";

    public async Task IncrementAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default)
        => await Db.StringIncrementAsync(Key(userId, contextType, contextId));

    public async Task<long> GetCountAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default)
    {
        var val = await Db.StringGetAsync(Key(userId, contextType, contextId));
        return val.HasValue ? (long)val : 0;
    }

    public async Task ClearAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default)
        => await Db.KeyDeleteAsync(Key(userId, contextType, contextId));

    public async Task SetAsync(Guid userId, string contextType, Guid contextId, long count, CancellationToken ct = default)
        => await Db.StringSetAsync(Key(userId, contextType, contextId), count);

    public async Task<IReadOnlyList<(string ContextType, Guid ContextId, long Count)>> GetAllAsync(
        Guid userId,
        IReadOnlyList<(string type, Guid id)> contexts,
        CancellationToken ct = default)
    {
        if (contexts.Count == 0) return [];

        var keys = contexts.Select(c => Key(userId, c.type, c.id)).ToArray();
        var values = await Db.StringGetAsync(keys);
        var result = new List<(string, Guid, long)>(contexts.Count);

        for (var i = 0; i < contexts.Count; i++)
        {
            var count = values[i].HasValue ? (long)values[i] : 0;
            if (count > 0)
                result.Add((contexts[i].type, contexts[i].id, count));
        }

        return result;
    }
}
```

- [ ] **Step 5: Run integration tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Integration.Tests/ --filter "RedisUnread" --logger "console;verbosity=minimal"
```

Expected: `Passed: 2, Failed: 0`

- [ ] **Step 6: Commit**

```bash
git add src/ChatHerder.Infrastructure/Cache/RedisPresenceStore.cs \
        src/ChatHerder.Infrastructure/Cache/RedisUnreadStore.cs \
        tests/ChatHerder.Integration.Tests/
git commit -m "feat: add RedisPresenceStore and RedisUnreadStore"
```

---

## Task 5: PresenceMonitorService + DI Wiring

**Files:**
- Create: `src/ChatHerder.Infrastructure/Services/PresenceMonitorService.cs`
- Modify: `src/ChatHerder.Infrastructure/InfrastructureExtensions.cs`

- [ ] **Step 1: Write a failing unit test**

Create `tests/ChatHerder.Unit.Tests/Services/PresenceMonitorServiceTests.cs`:

```csharp
using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Services;
using Microsoft.Extensions.Logging;
using NSubstitute;

namespace ChatHerder.Unit.Tests.Services;

public sealed class PresenceMonitorServiceTests
{
    [Fact]
    public async Task ExecuteAsync_WhenNoActiveUsers_DoesNotCallGetTabCount()
    {
        var presence = Substitute.For<IPresenceStore>();
        presence.GetActiveUsersAsync(Arg.Any<CancellationToken>()).Returns([]);

        var logger = Substitute.For<ILogger<PresenceMonitorService>>();
        var svc = new PresenceMonitorService(presence, logger);

        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        try { await svc.StartAsync(cts.Token); } catch (OperationCanceledException) { }

        await presence.DidNotReceive().GetTabCountAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>());
    }
}
```

- [ ] **Step 2: Run to confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "PresenceMonitor" --logger "console;verbosity=minimal"
```

Expected: FAIL — `PresenceMonitorService` not found

- [ ] **Step 3: Create `src/ChatHerder.Infrastructure/Services/PresenceMonitorService.cs`**

```csharp
using ChatHerder.Application.Ports;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ChatHerder.Infrastructure.Services;

// Ghost-cleanup safety net (ARCHITECTURE.md §12). Not the primary AFK path.
// Runs every 20s, removes stale tabs (no heartbeat in >70s), broadcasts offline/afk.
// Primary AFK transitions happen via SetAfk/SetActive/Heartbeat hub methods.
public sealed class PresenceMonitorService(
    IPresenceStore presence,
    ILogger<PresenceMonitorService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(20);
    private const double StaleSeconds = 70;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(Interval, stoppingToken);
            await SweepAsync(stoppingToken);
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        try
        {
            var activeUsers = await presence.GetActiveUsersAsync(ct);
            var threshold   = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - StaleSeconds;

            foreach (var userId in activeUsers)
            {
                var stale = await presence.GetStaleTabsAsync(userId, threshold, ct);
                foreach (var (connId, _) in stale)
                    await presence.RemoveStaleTabAsync(userId, connId, ct);

                var remaining = await presence.GetTabCountAsync(userId, ct);
                if (remaining == 0)
                {
                    await presence.SetStatusAsync(userId, "offline", ct);
                    await presence.RemoveFromActiveUsersAsync(userId, ct);
                    logger.LogDebug("Swept offline: {UserId}", userId);
                }
                else if (await presence.IsAllTabsAfkAsync(userId, ct))
                {
                    var current = await presence.GetStatusAsync(userId, ct);
                    if (current != "afk")
                    {
                        await presence.SetStatusAsync(userId, "afk", ct);
                        logger.LogDebug("Swept afk: {UserId}", userId);
                    }
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "PresenceMonitorService sweep error");
        }
    }
}
```

- [ ] **Step 4: Update `src/ChatHerder.Infrastructure/InfrastructureExtensions.cs`**

Add the three new registrations after the existing `AddScoped<IEmailSender>` line:

```csharp
services.AddSingleton<IPresenceStore, RedisPresenceStore>();
services.AddSingleton<IUnreadStore, RedisUnreadStore>();
services.AddHostedService<PresenceMonitorService>();
```

Also add the using directives:
```csharp
using ChatHerder.Infrastructure.Services;
```

- [ ] **Step 5: Run tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "PresenceMonitor" --logger "console;verbosity=minimal"
dotnet build ChatHerder.sln -c Debug
```

Expected: Passed: 1; 0 build errors

- [ ] **Step 6: Commit**

```bash
git add src/ChatHerder.Infrastructure/Services/PresenceMonitorService.cs \
        src/ChatHerder.Infrastructure/InfrastructureExtensions.cs \
        tests/ChatHerder.Unit.Tests/Services/
git commit -m "feat: add PresenceMonitorService and register IPresenceStore/IUnreadStore"
```

---

## Task 6: UserEndpoints

**Files:**
- Create: `src/ChatHerder.API/Endpoints/UserEndpoints.cs`

Routes: `GET /users/me`, `PATCH /users/me`, `GET /users/by-username/{name}`.

- [ ] **Step 1: Write failing unit tests**

Create `tests/ChatHerder.Unit.Tests/Endpoints/UserEndpointsTests.cs`:

```csharp
using System.Security.Claims;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class UserEndpointsTests
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

    [Fact]
    public async Task GetMe_ReturnsUser_WhenExists()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var principal = MakePrincipal(user.Id);
        var result = await UserEndpointsTestHelper.GetMe(principal, db, CancellationToken.None);

        Assert.IsType<Ok<object>>(result);
    }
}

// Helper exposes internal static methods for testing
internal static class UserEndpointsTestHelper
{
    public static Task<IResult> GetMe(ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.UserEndpoints.GetMeInternal(p, db, ct);
}
```

- [ ] **Step 2: Run to confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "UserEndpoints" --logger "console;verbosity=minimal"
```

Expected: FAIL — `UserEndpoints` not found

- [ ] **Step 3: Create `src/ChatHerder.API/Endpoints/UserEndpoints.cs`**

```csharp
using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class UserEndpoints
{
    public static RouteGroupBuilder MapUserEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/me",                   GetMe)                .RequireAuthorization();
        group.MapPatch("/me",                 PatchMe)              .RequireAuthorization();
        group.MapGet("/by-username/{name}",   GetByUsername)        .RequireAuthorization();
        return group;
    }

    // Exposed for unit testing
    internal static Task<IResult> GetMeInternal(ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => GetMe(p, db, ct);

    private static async Task<IResult> GetMe(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.DeletedAt == null, ct);
        if (user is null) return Results.NotFound();
        return Results.Ok(new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl));
    }

    private static async Task<IResult> PatchMe(
        UpdateMeRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.DeletedAt == null, ct);
        if (user is null) return Results.NotFound();

        if (req.AvatarUrl is not null)
        {
            if (req.AvatarUrl.Length > 2048)
                return Results.BadRequest(new { error = "Avatar URL must be ≤ 2048 characters." });
            user.AvatarUrl = req.AvatarUrl;
        }

        await db.SaveChangesAsync(ct);
        return Results.Ok(new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl));
    }

    private static async Task<IResult> GetByUsername(
        string name,
        AppDbContext db,
        CancellationToken ct)
    {
        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Username == name && u.DeletedAt == null, ct);
        if (user is null) return Results.NotFound();
        return Results.Ok(new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl));
    }
}

public sealed record UpdateMeRequest(string? AvatarUrl);
```

- [ ] **Step 4: Run tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "UserEndpoints" --logger "console;verbosity=minimal"
```

Expected: `Passed: 1, Failed: 0`

- [ ] **Step 5: Commit**

```bash
git add src/ChatHerder.API/Endpoints/UserEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/UserEndpointsTests.cs
git commit -m "feat: add UserEndpoints (GET /me, PATCH /me, GET /by-username)"
```

---

## Task 7: RoomEndpoints — CRUD + Join/Leave + Members + Message History

**Files:**
- Create: `src/ChatHerder.API/Endpoints/RoomEndpoints.cs`

Routes (all under `/api/rooms`):
- `GET /rooms` — public catalog
- `GET /rooms/my` — caller's rooms
- `POST /rooms` — create
- `GET /rooms/{id}` — detail
- `PATCH /rooms/{id}` — update [owner]
- `DELETE /rooms/{id}` — delete cascade [owner]
- `POST /rooms/{id}/join` — join public
- `DELETE /rooms/{id}/leave` — leave (owner cannot)
- `GET /rooms/{id}/members` — member list with presence
- `GET /rooms/{id}/messages` — keyset pagination + gap recovery

- [ ] **Step 1: Write failing unit tests**

Create `tests/ChatHerder.Unit.Tests/Endpoints/RoomEndpointsTests.cs`:

```csharp
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class RoomEndpointsTests
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

    [Fact]
    public async Task CreateRoom_ReturnsOk_WithValidRequest()
    {
        await using var db = BuildContext();
        var owner = new User { Username = "owner", Email = "o@test.com", PasswordHash = "x" };
        db.Users.Add(owner);
        await db.SaveChangesAsync();

        var req = new CreateRoomRequest("general", "A room", "Public");
        var principal = MakePrincipal(owner.Id);
        var result = await RoomEndpointsHelper.CreateRoom(req, principal, db, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(1, await db.Rooms.CountAsync());
        Assert.Equal(1, await db.RoomMemberships.CountAsync());
    }

    [Fact]
    public async Task JoinRoom_Returns409_WhenAlreadyMember()
    {
        await using var db = BuildContext();
        var user = new User { Username = "u1", Email = "u1@test.com", PasswordHash = "x" };
        var owner = new User { Username = "owner", Email = "o@test.com", PasswordHash = "x" };
        db.Users.AddRange(user, owner);
        var room = new Room { Name = "general", Visibility = RoomVisibility.Public, OwnerId = owner.Id };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = user.Id, Role = MemberRole.Member });
        await db.SaveChangesAsync();

        var result = await RoomEndpointsHelper.JoinRoom(room.Id, MakePrincipal(user.Id), db, CancellationToken.None);

        Assert.Equal(409, GetStatusCode(result));
    }

    private static int GetStatusCode(IResult r)
    {
        // Use reflection to read the StatusCode from Results.Conflict / Results.NotFound etc.
        var prop = r.GetType().GetProperty("StatusCode");
        return (int)(prop?.GetValue(r) ?? 0);
    }
}

internal static class RoomEndpointsHelper
{
    public static Task<IResult> CreateRoom(CreateRoomRequest req, System.Security.Claims.ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.RoomEndpoints.CreateRoomInternal(req, p, db, ct);
    public static Task<IResult> JoinRoom(Guid id, System.Security.Claims.ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.RoomEndpoints.JoinRoomInternal(id, p, db, ct);
}
```

- [ ] **Step 2: Run to confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "RoomEndpoints" --logger "console;verbosity=minimal"
```

Expected: FAIL — `RoomEndpoints` not found

- [ ] **Step 3: Create `src/ChatHerder.API/Endpoints/RoomEndpoints.cs`**

```csharp
using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class RoomEndpoints
{
    public static RouteGroupBuilder MapRoomEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("",              GetPublicCatalog) .AllowAnonymous();
        group.MapGet("/my",           GetMyRooms)       .RequireAuthorization();
        group.MapPost("",             CreateRoom)       .RequireAuthorization();
        group.MapGet("/{id:guid}",    GetRoom)          .RequireAuthorization();
        group.MapPatch("/{id:guid}",  UpdateRoom)       .RequireAuthorization();
        group.MapDelete("/{id:guid}", DeleteRoom)       .RequireAuthorization();
        group.MapPost("/{id:guid}/join",    JoinRoom)   .RequireAuthorization();
        group.MapDelete("/{id:guid}/leave", LeaveRoom)  .RequireAuthorization();
        group.MapGet("/{id:guid}/members",  GetMembers) .RequireAuthorization();
        group.MapGet("/{id:guid}/messages", GetMessages).RequireAuthorization();

        // Admin actions
        group.MapGet("/{id:guid}/bans",                          GetBans)         .RequireAuthorization();
        group.MapPost("/{id:guid}/members/{userId:guid}/ban",    BanMember)       .RequireAuthorization();
        group.MapDelete("/{id:guid}/bans/{userId:guid}",         UnbanMember)     .RequireAuthorization();
        group.MapPost("/{id:guid}/members/{userId:guid}/make-admin", MakeAdmin)   .RequireAuthorization();
        group.MapDelete("/{id:guid}/members/{userId:guid}/admin",    RemoveAdmin) .RequireAuthorization();
        group.MapDelete("/{id:guid}/messages/{msgId:guid}",      DeleteMessage)   .RequireAuthorization();
        return group;
    }

    // ── Exposed for unit tests ─────────────────────────────────────────────────
    internal static Task<IResult> CreateRoomInternal(CreateRoomRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => CreateRoom(req, p, db, ct);
    internal static Task<IResult> JoinRoomInternal(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => JoinRoom(id, p, db, ct);

    // ── Public catalog ─────────────────────────────────────────────────────────
    private static async Task<IResult> GetPublicCatalog(
        AppDbContext db,
        string? search,
        int page = 1,
        int limit = 20,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 100);
        page  = Math.Max(1, page);

        var query = db.Rooms
            .Where(r => r.Visibility == RoomVisibility.Public && r.DeletedAt == null);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(r => EF.Functions.ILike(r.Name, $"%{search}%"));

        var rooms = await query
            .OrderBy(r => r.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(r => new
            {
                r.Id, r.Name, r.Description, r.OwnerId, r.CreatedAt,
                MemberCount = db.RoomMemberships.Count(m => m.RoomId == r.Id),
            })
            .ToListAsync(ct);

        return Results.Ok(rooms);
    }

    // ── My rooms ───────────────────────────────────────────────────────────────
    private static async Task<IResult> GetMyRooms(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);

        var rooms = await db.RoomMemberships
            .Where(m => m.UserId == userId)
            .Include(m => m.Room)
            .Where(m => m.Room.DeletedAt == null)
            .Select(m => new RoomDto(
                m.Room.Id,
                m.Room.Name,
                m.Room.Description,
                m.Room.Visibility.ToString(),
                m.Room.OwnerId,
                m.Room.CreatedAt,
                db.RoomMemberships.Count(x => x.RoomId == m.RoomId),
                m.Role.ToString()))
            .ToListAsync(ct);

        return Results.Ok(rooms);
    }

    // ── Create room ────────────────────────────────────────────────────────────
    private static async Task<IResult> CreateRoom(
        CreateRoomRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || req.Name.Length > 64)
            return Results.BadRequest(new { error = "Room name must be 1–64 characters." });

        if (!Enum.TryParse<RoomVisibility>(req.Visibility, ignoreCase: true, out var visibility))
            return Results.BadRequest(new { error = "Visibility must be 'Public' or 'Private'." });

        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);

        if (await db.Rooms.AnyAsync(r => r.Name == req.Name && r.DeletedAt == null, ct))
            return Results.Conflict(new { error = "Room name is already taken." });

        var room = new Room
        {
            Name        = req.Name,
            Description = req.Description,
            Visibility  = visibility,
            OwnerId     = userId,
        };
        db.Rooms.Add(room);

        db.RoomMemberships.Add(new RoomMembership
        {
            RoomId = room.Id,
            UserId = userId,
            Role   = MemberRole.Owner,
        });

        // Allocate sequence counter row for the new room (AGENT.md §3.4)
        // ContextSequences.ContextType is the ContextType enum; never use "room" string here.
        db.ContextSequences.Add(new Domain.Entities.ContextSequences
        {
            ContextType = Domain.Enums.ContextType.Room,
            ContextId   = room.Id,
            NextValue   = 1,
        });

        await db.SaveChangesAsync(ct);

        return Results.Ok(new RoomDto(
            room.Id, room.Name, room.Description,
            room.Visibility.ToString(), room.OwnerId, room.CreatedAt,
            1, "Owner"));
    }

    // ── Get room ───────────────────────────────────────────────────────────────
    private static async Task<IResult> GetRoom(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == id && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();

        var userId     = Guid.Parse(principal.FindFirstValue("user_id")!);
        var membership = await db.RoomMemberships.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
        var count      = await db.RoomMemberships.CountAsync(m => m.RoomId == id, ct);

        return Results.Ok(new RoomDto(
            room.Id, room.Name, room.Description,
            room.Visibility.ToString(), room.OwnerId, room.CreatedAt,
            count, membership?.Role.ToString()));
    }

    // ── Update room ────────────────────────────────────────────────────────────
    private static async Task<IResult> UpdateRoom(
        Guid id,
        UpdateRoomRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);
        var room   = await db.Rooms.FirstOrDefaultAsync(r => r.Id == id && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();
        if (room.OwnerId != userId) return Results.Forbid();

        if (req.Name is not null)
        {
            if (req.Name.Length > 64) return Results.BadRequest(new { error = "Room name must be ≤ 64 characters." });
            if (await db.Rooms.AnyAsync(r => r.Name == req.Name && r.Id != id && r.DeletedAt == null, ct))
                return Results.Conflict(new { error = "Room name is already taken." });
            room.Name = req.Name;
        }

        if (req.Description is not null) room.Description = req.Description;

        if (req.Visibility is not null)
        {
            if (!Enum.TryParse<RoomVisibility>(req.Visibility, ignoreCase: true, out var v))
                return Results.BadRequest(new { error = "Visibility must be 'Public' or 'Private'." });
            room.Visibility = v;
        }

        await db.SaveChangesAsync(ct);
        var count = await db.RoomMemberships.CountAsync(m => m.RoomId == id, ct);
        return Results.Ok(new RoomDto(room.Id, room.Name, room.Description, room.Visibility.ToString(), room.OwnerId, room.CreatedAt, count, "Owner"));
    }

    // ── Delete room ────────────────────────────────────────────────────────────
    private static async Task<IResult> DeleteRoom(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        IFileStorage fileStorage,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);
        var room   = await db.Rooms.FirstOrDefaultAsync(r => r.Id == id && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();
        if (room.OwnerId != userId) return Results.Forbid();

        // Cascade: delete attachments → messages → memberships → bans → invitations → room
        var attachmentPaths = await db.Messages
            .Where(m => m.RoomId == id && m.AttachmentId != null)
            .Join(db.Attachments, m => m.AttachmentId, a => a.Id, (_, a) => a.StoragePath)
            .ToListAsync(ct);

        foreach (var path in attachmentPaths)
            await fileStorage.DeleteAsync(path, ct);

        await db.Messages.Where(m => m.RoomId == id).ExecuteDeleteAsync(ct);
        await db.RoomMemberships.Where(m => m.RoomId == id).ExecuteDeleteAsync(ct);
        await db.RoomBans.Where(b => b.RoomId == id).ExecuteDeleteAsync(ct);
        await db.RoomInvitations.Where(i => i.RoomId == id).ExecuteDeleteAsync(ct);
        await db.ContextSequences.Where(s => s.ContextType == Domain.Enums.ContextType.Room && s.ContextId == id).ExecuteDeleteAsync(ct);

        room.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // ── Join room ──────────────────────────────────────────────────────────────
    private static async Task<IResult> JoinRoom(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);
        var room   = await db.Rooms.FirstOrDefaultAsync(r => r.Id == id && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();
        if (room.Visibility == RoomVisibility.Private) return Results.Forbid();

        var activeBan = await db.RoomBans.AnyAsync(b => b.RoomId == id && b.BannedUserId == userId && b.RevokedAt == null, ct);
        if (activeBan) return Results.Problem("You are banned from this room.", statusCode: 403);

        var already = await db.RoomMemberships.AnyAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (already) return Results.Conflict(new { error = "Already a member." });

        db.RoomMemberships.Add(new RoomMembership { RoomId = id, UserId = userId, Role = MemberRole.Member });
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // ── Leave room ─────────────────────────────────────────────────────────────
    private static async Task<IResult> LeaveRoom(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId     = Guid.Parse(principal.FindFirstValue("user_id")!);
        var membership = await db.RoomMemberships.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (membership is null) return Results.NotFound();
        if (membership.Role == MemberRole.Owner) return Results.BadRequest(new { error = "Owner cannot leave. Delete the room instead." });

        await db.RoomMemberships.Where(m => m.RoomId == id && m.UserId == userId).ExecuteDeleteAsync(ct);
        return Results.NoContent();
    }

    // ── Members ────────────────────────────────────────────────────────────────
    private static async Task<IResult> GetMembers(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        IPresenceStore presence,
        CancellationToken ct)
    {
        var userId    = Guid.Parse(principal.FindFirstValue("user_id")!);
        var isMember  = await db.RoomMemberships.AnyAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (!isMember) return Results.Forbid();

        var members = await db.RoomMemberships
            .Where(m => m.RoomId == id)
            .Include(m => m.User)
            .ToListAsync(ct);

        var dtos = new List<RoomMemberDto>(members.Count);
        foreach (var m in members)
        {
            var status = await presence.GetStatusAsync(m.UserId, ct) ?? "offline";
            dtos.Add(new RoomMemberDto(m.UserId, m.User.Username, m.User.AvatarUrl, m.Role.ToString(), m.JoinedAt, status));
        }

        return Results.Ok(dtos);
    }

    // ── Messages (keyset pagination + afterSeq gap recovery) ─────────────────
    private static async Task<IResult> GetMessages(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        Guid? before,
        long? afterSeq,
        int limit = 50,
        CancellationToken ct = default)
    {
        var userId   = Guid.Parse(principal.FindFirstValue("user_id")!);
        var isMember = await db.RoomMemberships.AnyAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (!isMember) return Results.Forbid();

        limit = Math.Clamp(limit, 1, 100);

        IQueryable<Message> query = db.Messages
            .Where(m => m.RoomId == id && m.DeletedAt == null)
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author);

        if (afterSeq.HasValue)
        {
            // Gap-recovery: return messages after a known sequence number (ascending)
            query = query
                .Where(m => m.SequenceNumber > afterSeq.Value)
                .OrderBy(m => m.SequenceNumber)
                .Take(limit);
        }
        else if (before.HasValue)
        {
            // Cursor-based: load messages before a given message id (descending for efficiency)
            var cursor = await db.Messages.FirstOrDefaultAsync(m => m.Id == before, ct);
            if (cursor is null) return Results.BadRequest(new { error = "Cursor message not found." });

            query = query
                .Where(m => m.SentAt < cursor.SentAt || (m.SentAt == cursor.SentAt && m.Id.CompareTo(cursor.Id) < 0))
                .OrderByDescending(m => m.SentAt).ThenByDescending(m => m.Id)
                .Take(limit);
        }
        else
        {
            // First load: most recent messages, descending
            query = query
                .OrderByDescending(m => m.SentAt).ThenByDescending(m => m.Id)
                .Take(limit);
        }

        var messages = await query.ToListAsync(ct);
        return Results.Ok(messages.Select(ToDto));
    }

    // ── Admin: Ban member ──────────────────────────────────────────────────────
    private static async Task<IResult> BanMember(
        Guid id,
        Guid userId,
        BanMemberRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var callerId = Guid.Parse(principal.FindFirstValue("user_id")!);
        if (!await IsAdminOrOwner(db, id, callerId, ct)) return Results.Forbid();

        var targetMembership = await db.RoomMemberships
            .FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (targetMembership is null) return Results.NotFound();
        if (targetMembership.Role == MemberRole.Owner) return Results.BadRequest(new { error = "Cannot ban the room owner." });

        db.RoomBans.Add(new RoomBan
        {
            RoomId        = id,
            BannedUserId  = userId,
            BannedByUserId = callerId,
            Reason        = req.Reason,
        });
        await db.RoomMemberships.Where(m => m.RoomId == id && m.UserId == userId).ExecuteDeleteAsync(ct);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // ── Admin: Unban member ────────────────────────────────────────────────────
    private static async Task<IResult> UnbanMember(
        Guid id,
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var callerId = Guid.Parse(principal.FindFirstValue("user_id")!);
        if (!await IsAdminOrOwner(db, id, callerId, ct)) return Results.Forbid();

        var ban = await db.RoomBans
            .FirstOrDefaultAsync(b => b.RoomId == id && b.BannedUserId == userId && b.RevokedAt == null, ct);
        if (ban is null) return Results.NotFound();

        ban.RevokedAt       = DateTime.UtcNow;
        ban.RevokedByUserId = callerId;
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // ── Admin: Get bans ────────────────────────────────────────────────────────
    private static async Task<IResult> GetBans(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var callerId = Guid.Parse(principal.FindFirstValue("user_id")!);
        if (!await IsAdminOrOwner(db, id, callerId, ct)) return Results.Forbid();

        var bans = await db.RoomBans
            .Where(b => b.RoomId == id && b.RevokedAt == null)
            .Include(b => b.BannedUser)
            .Include(b => b.BannedByUser)
            .Select(b => new RoomBanDto(
                b.BannedUserId,
                b.BannedUser.Username,
                b.BannedByUserId,
                b.BannedByUser.Username,
                b.Reason,
                b.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(bans);
    }

    // ── Owner: Make admin ──────────────────────────────────────────────────────
    private static async Task<IResult> MakeAdmin(
        Guid id,
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var callerId = Guid.Parse(principal.FindFirstValue("user_id")!);
        var room     = await db.Rooms.FirstOrDefaultAsync(r => r.Id == id && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();
        if (room.OwnerId != callerId) return Results.Forbid();

        var target = await db.RoomMemberships.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (target is null) return Results.NotFound();
        if (target.Role == MemberRole.Owner) return Results.BadRequest(new { error = "Cannot change role of owner." });

        target.Role = MemberRole.Admin;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // ── Admin: Remove admin ────────────────────────────────────────────────────
    private static async Task<IResult> RemoveAdmin(
        Guid id,
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var callerId   = Guid.Parse(principal.FindFirstValue("user_id")!);
        var callerRole = await db.RoomMemberships
            .Where(m => m.RoomId == id && m.UserId == callerId)
            .Select(m => (MemberRole?)m.Role)
            .FirstOrDefaultAsync(ct);

        if (callerRole is null or MemberRole.Member) return Results.Forbid();
        if (userId == callerId) return Results.BadRequest(new { error = "Cannot demote yourself." });

        var target = await db.RoomMemberships.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (target is null) return Results.NotFound();
        if (target.Role == MemberRole.Owner) return Results.BadRequest(new { error = "Cannot demote the owner." });

        target.Role = MemberRole.Member;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // ── Admin: Delete any message ──────────────────────────────────────────────
    private static async Task<IResult> DeleteMessage(
        Guid id,
        Guid msgId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var callerId = Guid.Parse(principal.FindFirstValue("user_id")!);
        if (!await IsAdminOrOwner(db, id, callerId, ct)) return Results.Forbid();

        var msg = await db.Messages.FirstOrDefaultAsync(m => m.Id == msgId && m.RoomId == id && m.DeletedAt == null, ct);
        if (msg is null) return Results.NotFound();

        msg.DeletedAt       = DateTime.UtcNow;
        msg.DeletedByUserId = callerId;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    private static async Task<bool> IsAdminOrOwner(AppDbContext db, Guid roomId, Guid userId, CancellationToken ct)
    {
        var role = await db.RoomMemberships
            .Where(m => m.RoomId == roomId && m.UserId == userId)
            .Select(m => (MemberRole?)m.Role)
            .FirstOrDefaultAsync(ct);
        return role is MemberRole.Admin or MemberRole.Owner;
    }

    internal static MessageDto ToDto(Message m) => new(
        m.Id,
        m.SequenceNumber,
        m.DeletedAt == null ? m.Content : null,
        new UserSummary(m.Author.Id, m.Author.Username, m.Author.AvatarUrl),
        m.SentAt,
        m.EditedAt,
        m.DeletedAt != null,
        m.ReplyToMessage is null ? null : new MessageDto(
            m.ReplyToMessage.Id,
            m.ReplyToMessage.SequenceNumber,
            m.ReplyToMessage.DeletedAt == null ? m.ReplyToMessage.Content : null,
            new UserSummary(m.ReplyToMessage.Author.Id, m.ReplyToMessage.Author.Username, m.ReplyToMessage.Author.AvatarUrl),
            m.ReplyToMessage.SentAt, m.ReplyToMessage.EditedAt, m.ReplyToMessage.DeletedAt != null, null, null),
        m.Attachment is null ? null : new AttachmentDto(m.Attachment.Id, m.Attachment.FileName, m.Attachment.ContentType, m.Attachment.SizeBytes, m.Attachment.Comment));
}
```

- [ ] **Step 4: Add missing navigation properties to RoomBan entity**

Check `src/ChatHerder.Domain/Entities/RoomBan.cs` — ensure it has `BannedUser`, `BannedByUser`, `RevokedByUserId`, and `RevokedAt` nav properties. If missing, add:

```csharp
public Guid? RevokedByUserId { get; set; }
public DateTime? RevokedAt { get; set; }
public User BannedUser { get; init; } = null!;
public User BannedByUser { get; init; } = null!;
```

And in `AppDbContext.OnModelCreating`, find the RoomBans config and add:
```csharp
e.HasOne(b => b.BannedUser).WithMany().HasForeignKey(b => b.BannedUserId).OnDelete(DeleteBehavior.Cascade);
e.HasOne(b => b.BannedByUser).WithMany().HasForeignKey(b => b.BannedByUserId).OnDelete(DeleteBehavior.Restrict);
e.HasOne<User>().WithMany().HasForeignKey(b => b.RevokedByUserId).OnDelete(DeleteBehavior.SetNull);
```

Then generate a migration:
```bash
dotnet ef migrations add AddRoomBanNavProps \
  --project src/ChatHerder.Infrastructure \
  --startup-project src/ChatHerder.API \
  --output-dir Migrations
```

- [ ] **Step 5: Run tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "RoomEndpoints" --logger "console;verbosity=minimal"
dotnet build ChatHerder.sln -c Debug
```

Expected: `Passed: 2, Failed: 0`; 0 build errors

- [ ] **Step 6: Commit**

```bash
git add src/ChatHerder.API/Endpoints/RoomEndpoints.cs \
        src/ChatHerder.Domain/Entities/RoomBan.cs \
        src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs \
        src/ChatHerder.Infrastructure/Migrations/ \
        tests/ChatHerder.Unit.Tests/Endpoints/RoomEndpointsTests.cs
git commit -m "feat: add RoomEndpoints (CRUD, join/leave, members, messages, admin actions)"
```

---

## Task 8: RoomInvitationEndpoints + MessageEndpoints

**Files:**
- Create: `src/ChatHerder.API/Endpoints/RoomInvitationEndpoints.cs`
- Create: `src/ChatHerder.API/Endpoints/MessageEndpoints.cs`

- [ ] **Step 1: Write failing unit tests**

Create `tests/ChatHerder.Unit.Tests/Endpoints/MessageEndpointsTests.cs`:

```csharp
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class MessageEndpointsTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new AppDbContext(opts);
    }

    [Fact]
    public async Task EditMessage_Returns403_WhenCallerIsNotAuthor()
    {
        await using var db = BuildContext();
        var author = new User { Username = "a", Email = "a@x.com", PasswordHash = "x" };
        var other  = new User { Username = "b", Email = "b@x.com", PasswordHash = "x" };
        db.Users.AddRange(author, other);
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = author.Id };
        db.Rooms.Add(room);
        var msg = new Message { RoomId = room.Id, AuthorId = author.Id, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();

        var principal = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id", other.Id.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test"));

        var result = await MessageEndpointsHelper.EditMessage(
            msg.Id, new EditMessageRequest("changed"), principal, db, CancellationToken.None);

        var prop = result.GetType().GetProperty("StatusCode");
        Assert.Equal(403, (int)(prop?.GetValue(result) ?? 0));
    }
}

internal static class MessageEndpointsHelper
{
    public static Task<IResult> EditMessage(Guid id, EditMessageRequest req, System.Security.Claims.ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.MessageEndpoints.EditMessageInternal(id, req, p, db, ct);
}
```

- [ ] **Step 2: Run to confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "MessageEndpoints" --logger "console;verbosity=minimal"
```

Expected: FAIL — `MessageEndpoints` not found

- [ ] **Step 3: Create `src/ChatHerder.API/Endpoints/MessageEndpoints.cs`**

```csharp
using System.Security.Claims;
using System.Text;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class MessageEndpoints
{
    private const int MaxMessageBytes = 3072;

    public static RouteGroupBuilder MapMessageEndpoints(this RouteGroupBuilder group)
    {
        group.MapPatch("/{id:guid}",   EditMessage)   .RequireAuthorization();
        group.MapDelete("/{id:guid}",  DeleteMessage) .RequireAuthorization();
        return group;
    }

    internal static Task<IResult> EditMessageInternal(Guid id, EditMessageRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => EditMessage(id, req, p, db, ct);

    private static async Task<IResult> EditMessage(
        Guid id,
        EditMessageRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Content))
            return Results.BadRequest(new { error = "Content cannot be empty." });
        if (Encoding.UTF8.GetByteCount(req.Content) > MaxMessageBytes)
            return Results.BadRequest(new { error = "Message exceeds 3 KB limit." });

        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);
        var msg    = await db.Messages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstOrDefaultAsync(m => m.Id == id && m.DeletedAt == null, ct);

        if (msg is null) return Results.NotFound();
        if (msg.AuthorId != userId) return Results.Forbid();

        msg.Content  = req.Content;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.Ok(RoomEndpoints.ToDto(msg));
    }

    private static async Task<IResult> DeleteMessage(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);
        var msg    = await db.Messages
            .Include(m => m.Room)
            .FirstOrDefaultAsync(m => m.Id == id && m.DeletedAt == null, ct);

        if (msg is null) return Results.NotFound();

        var isAuthor = msg.AuthorId == userId;
        var isAdmin  = await db.RoomMemberships
            .AnyAsync(m => m.RoomId == msg.RoomId && m.UserId == userId &&
                           (m.Role == MemberRole.Admin || m.Role == MemberRole.Owner), ct);

        if (!isAuthor && !isAdmin) return Results.Forbid();

        msg.DeletedAt       = DateTime.UtcNow;
        msg.DeletedByUserId = userId;
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}
```

- [ ] **Step 4: Create `src/ChatHerder.API/Endpoints/RoomInvitationEndpoints.cs`**

```csharp
using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class RoomInvitationEndpoints
{
    public static RouteGroupBuilder MapRoomInvitationEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/rooms/{roomId:guid}/invitations",    GetRoomInvitations) .RequireAuthorization();
        group.MapPost("/rooms/{roomId:guid}/invitations",   SendInvitation)     .RequireAuthorization();
        group.MapGet("/invitations",                        GetMyInvitations)   .RequireAuthorization();
        group.MapPost("/invitations/{id:guid}/accept",      AcceptInvitation)   .RequireAuthorization();
        group.MapPost("/invitations/{id:guid}/reject",      RejectInvitation)   .RequireAuthorization();
        return group;
    }

    private static async Task<IResult> GetRoomInvitations(
        Guid roomId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var callerId = Guid.Parse(principal.FindFirstValue("user_id")!);
        var callerRole = await db.RoomMemberships
            .Where(m => m.RoomId == roomId && m.UserId == callerId)
            .Select(m => (MemberRole?)m.Role)
            .FirstOrDefaultAsync(ct);

        if (callerRole is null or MemberRole.Member) return Results.Forbid();

        var invitations = await db.RoomInvitations
            .Where(i => i.RoomId == roomId && i.Status == InvitationStatus.Pending)
            .Include(i => i.Room)
            .Include(i => i.InvitedByUser)
            .Include(i => i.InvitedUser)
            .Select(i => new RoomInvitationDto(
                i.Id, i.RoomId, i.Room.Name,
                i.InvitedByUserId, i.InvitedByUser.Username,
                i.InvitedUserId, i.InvitedUser.Username,
                i.Status.ToString(), i.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(invitations);
    }

    private static async Task<IResult> SendInvitation(
        Guid roomId,
        InviteUserRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var callerId = Guid.Parse(principal.FindFirstValue("user_id")!);
        var callerRole = await db.RoomMemberships
            .Where(m => m.RoomId == roomId && m.UserId == callerId)
            .Select(m => (MemberRole?)m.Role)
            .FirstOrDefaultAsync(ct);
        if (callerRole is null or MemberRole.Member) return Results.Forbid();

        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();

        var invitee = await db.Users.FirstOrDefaultAsync(u => u.Username == req.Username && u.DeletedAt == null, ct);
        if (invitee is null) return Results.NotFound(new { error = "User not found." });

        if (await db.RoomMemberships.AnyAsync(m => m.RoomId == roomId && m.UserId == invitee.Id, ct))
            return Results.Conflict(new { error = "User is already a member." });

        if (await db.RoomBans.AnyAsync(b => b.RoomId == roomId && b.BannedUserId == invitee.Id && b.RevokedAt == null, ct))
            return Results.Problem("User is banned from this room.", statusCode: 403);

        db.RoomInvitations.Add(new RoomInvitation
        {
            RoomId          = roomId,
            InvitedByUserId = callerId,
            InvitedUserId   = invitee.Id,
            Status          = InvitationStatus.Pending,
        });
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    private static async Task<IResult> GetMyInvitations(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);

        var invitations = await db.RoomInvitations
            .Where(i => i.InvitedUserId == userId && i.Status == InvitationStatus.Pending)
            .Include(i => i.Room)
            .Include(i => i.InvitedByUser)
            .Include(i => i.InvitedUser)
            .Select(i => new RoomInvitationDto(
                i.Id, i.RoomId, i.Room.Name,
                i.InvitedByUserId, i.InvitedByUser.Username,
                i.InvitedUserId, i.InvitedUser.Username,
                i.Status.ToString(), i.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(invitations);
    }

    private static async Task<IResult> AcceptInvitation(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId     = Guid.Parse(principal.FindFirstValue("user_id")!);
        var invitation = await db.RoomInvitations
            .FirstOrDefaultAsync(i => i.Id == id && i.InvitedUserId == userId && i.Status == InvitationStatus.Pending, ct);
        if (invitation is null) return Results.NotFound();

        invitation.Status      = InvitationStatus.Accepted;
        invitation.RespondedAt = DateTime.UtcNow;

        db.RoomMemberships.Add(new RoomMembership
        {
            RoomId = invitation.RoomId,
            UserId = userId,
            Role   = MemberRole.Member,
        });

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RejectInvitation(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId     = Guid.Parse(principal.FindFirstValue("user_id")!);
        var invitation = await db.RoomInvitations
            .FirstOrDefaultAsync(i => i.Id == id && i.InvitedUserId == userId && i.Status == InvitationStatus.Pending, ct);
        if (invitation is null) return Results.NotFound();

        invitation.Status      = InvitationStatus.Rejected;
        invitation.RespondedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}
```

- [ ] **Step 5: Run tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "MessageEndpoints" --logger "console;verbosity=minimal"
dotnet build ChatHerder.sln -c Debug
```

Expected: `Passed: 1, Failed: 0`; 0 build errors

- [ ] **Step 6: Commit**

```bash
git add src/ChatHerder.API/Endpoints/MessageEndpoints.cs \
        src/ChatHerder.API/Endpoints/RoomInvitationEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/MessageEndpointsTests.cs
git commit -m "feat: add MessageEndpoints (edit/delete) and RoomInvitationEndpoints"
```

---

## Task 9: NotificationEndpoints + Program.cs Wiring

**Files:**
- Create: `src/ChatHerder.API/Endpoints/NotificationEndpoints.cs`
- Modify: `src/ChatHerder.API/Program.cs`

- [ ] **Step 1: Create `src/ChatHerder.API/Endpoints/NotificationEndpoints.cs`**

```csharp
using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class NotificationEndpoints
{
    public static RouteGroupBuilder MapNotificationEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/unread",                    GetUnread)      .RequireAuthorization();
        group.MapPost("/rooms/{id:guid}/read",     MarkRoomRead)   .RequireAuthorization();
        group.MapPost("/dialogs/{id:guid}/read",   MarkDialogRead) .RequireAuthorization();
        return group;
    }

    private static async Task<IResult> GetUnread(
        ClaimsPrincipal principal,
        AppDbContext db,
        IUnreadStore unread,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);

        var roomIds = await db.RoomMemberships
            .Where(m => m.UserId == userId)
            .Select(m => m.RoomId)
            .ToListAsync(ct);

        var dialogIds = await db.PersonalDialogs
            .Where(d => d.User1Id == userId || d.User2Id == userId)
            .Select(d => d.Id)
            .ToListAsync(ct);

        var contexts = roomIds.Select(id => ("room", id))
            .Concat(dialogIds.Select(id => ("dialog", id)))
            .ToList();

        var counts = await unread.GetAllAsync(userId, contexts, ct);
        return Results.Ok(counts.Select(c => new UnreadContextDto(c.ContextType, c.ContextId, c.Count)));
    }

    private static async Task<IResult> MarkRoomRead(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        IUnreadStore unread,
        CancellationToken ct)
    {
        var userId   = Guid.Parse(principal.FindFirstValue("user_id")!);
        var isMember = await db.RoomMemberships.AnyAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (!isMember) return Results.Forbid();

        await unread.ClearAsync(userId, "room", id, ct);

        var lastMsg = await db.Messages
            .Where(m => m.RoomId == id && m.DeletedAt == null)
            .OrderByDescending(m => m.SentAt)
            .FirstOrDefaultAsync(ct);

        if (lastMsg is not null)
        {
            var marker = await db.ReadMarkers
                .FirstOrDefaultAsync(r => r.UserId == userId && r.ContextType == "room" && r.ContextId == id, ct);

            if (marker is null)
            {
                db.ReadMarkers.Add(new Domain.Entities.ReadMarker
                {
                    UserId           = userId,
                    ContextType      = "room",
                    ContextId        = id,
                    LastReadMessageId = lastMsg.Id,
                    LastReadAt       = DateTime.UtcNow,
                });
            }
            else
            {
                marker.LastReadMessageId = lastMsg.Id;
                marker.LastReadAt        = DateTime.UtcNow;
            }

            await db.SaveChangesAsync(ct);
        }

        return Results.NoContent();
    }

    private static async Task<IResult> MarkDialogRead(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        IUnreadStore unread,
        CancellationToken ct)
    {
        var userId    = Guid.Parse(principal.FindFirstValue("user_id")!);
        var isParticipant = await db.PersonalDialogs
            .AnyAsync(d => d.Id == id && (d.User1Id == userId || d.User2Id == userId), ct);
        if (!isParticipant) return Results.Forbid();

        await unread.ClearAsync(userId, "dialog", id, ct);

        var lastMsg = await db.PersonalDialogMessages
            .Where(m => m.DialogId == id && m.DeletedAt == null)
            .OrderByDescending(m => m.SentAt)
            .FirstOrDefaultAsync(ct);

        if (lastMsg is not null)
        {
            var marker = await db.ReadMarkers
                .FirstOrDefaultAsync(r => r.UserId == userId && r.ContextType == "dialog" && r.ContextId == id, ct);

            if (marker is null)
            {
                db.ReadMarkers.Add(new Domain.Entities.ReadMarker
                {
                    UserId            = userId,
                    ContextType       = "dialog",
                    ContextId         = id,
                    LastReadMessageId = lastMsg.Id,
                    LastReadAt        = DateTime.UtcNow,
                });
            }
            else
            {
                marker.LastReadMessageId = lastMsg.Id;
                marker.LastReadAt        = DateTime.UtcNow;
            }

            await db.SaveChangesAsync(ct);
        }

        return Results.NoContent();
    }
}
```

- [ ] **Step 2: Update `src/ChatHerder.API/Program.cs` — map all new endpoint groups**

Replace the endpoint groups section (after `api.MapGroup("/sessions").MapSessionsEndpoints();`) with:

```csharp
var api = app.MapGroup("/api");
api.MapGroup("/auth").MapAuthEndpoints();
api.MapGroup("/sessions").MapSessionsEndpoints();
api.MapGroup("/users").MapUserEndpoints();
api.MapGroup("/rooms").MapRoomEndpoints();
api.MapGroup("").MapRoomInvitationEndpoints();   // mounts /rooms/{id}/invitations and /invitations at /api
api.MapGroup("/messages").MapMessageEndpoints();
api.MapGroup("").MapNotificationEndpoints();     // mounts /unread, /rooms/{id}/read, /dialogs/{id}/read at /api
```

Also add the using directives for the new endpoint types at the top:
```csharp
using ChatHerder.API.Endpoints;
```
(All endpoints are in the same namespace, so this single using covers all.)

- [ ] **Step 3: Verify build**

```bash
dotnet build ChatHerder.sln -c Debug
```

Expected: 0 errors, 0 warnings

- [ ] **Step 4: Commit**

```bash
git add src/ChatHerder.API/Endpoints/NotificationEndpoints.cs \
        src/ChatHerder.API/Program.cs
git commit -m "feat: add NotificationEndpoints and wire all Phase 4a endpoint groups in Program.cs"
```

---

## Task 10: Fix Entity Discrepancies + Final Migration

The existing entities have several gaps vs the spec. These MUST be fixed before the endpoint code above compiles.

**Verified discrepancies (from reading the actual entity files):**

| Entity | Current | Required by endpoints above |
|---|---|---|
| `RoomBan.UserId` | FK to banned user | Rename to `BannedUserId` (spec §6) |
| `RoomBan.Reason` | `required string` | Make nullable (`string?`) — ban reason is optional |
| `RoomBan` | Missing `RevokedByUserId` | Add `Guid? RevokedByUserId` |
| `RoomBan` | Has `User` nav prop | Rename to `BannedUser` |
| `ReadMarker.ContextType` | `ContextType` enum | Change to `string` — Redis keys are lowercase strings |
| `ReadMarker.LastReadSequenceNumber` | long | Change to `Guid? LastReadMessageId` |
| `ReadMarker.UpdatedAt` | DateTime | Rename to `LastReadAt` |

**Files:**
- Modify: `src/ChatHerder.Domain/Entities/RoomBan.cs`
- Modify: `src/ChatHerder.Domain/Entities/ReadMarker.cs`
- Modify: `src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs`
- Create: new EF migration

- [ ] **Step 1: Write failing test verifying entity shapes**

Create `tests/ChatHerder.Unit.Tests/Domain/EntityShapeTests.cs`:

```csharp
using ChatHerder.Domain.Entities;

namespace ChatHerder.Unit.Tests.Domain;

public sealed class EntityShapeTests
{
    [Fact]
    public void RoomBan_HasBannedUserIdProperty()
        => Assert.NotNull(typeof(RoomBan).GetProperty("BannedUserId"));

    [Fact]
    public void RoomBan_HasRevokedByUserIdProperty()
        => Assert.NotNull(typeof(RoomBan).GetProperty("RevokedByUserId"));

    [Fact]
    public void ReadMarker_ContextType_IsString()
        => Assert.Equal(typeof(string), typeof(ReadMarker).GetProperty("ContextType")!.PropertyType);

    [Fact]
    public void ReadMarker_HasLastReadMessageIdProperty()
        => Assert.NotNull(typeof(ReadMarker).GetProperty("LastReadMessageId"));

    [Fact]
    public void ReadMarker_HasLastReadAtProperty()
        => Assert.NotNull(typeof(ReadMarker).GetProperty("LastReadAt"));
}
```

- [ ] **Step 2: Run to confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "EntityShape" --logger "console;verbosity=minimal"
```

Expected: 5 failures

- [ ] **Step 3: Update `src/ChatHerder.Domain/Entities/RoomBan.cs`**

```csharp
namespace ChatHerder.Domain.Entities;

public sealed class RoomBan
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid BannedUserId { get; init; }
    public required Guid BannedByUserId { get; init; }
    public string? Reason { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }
    public Guid? RevokedByUserId { get; set; }

    public Room Room { get; init; } = null!;
    public User BannedUser { get; init; } = null!;
    public User BannedByUser { get; init; } = null!;
}
```

- [ ] **Step 4: Update `src/ChatHerder.Domain/Entities/ReadMarker.cs`**

```csharp
namespace ChatHerder.Domain.Entities;

public sealed class ReadMarker
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid UserId { get; init; }
    public required string ContextType { get; init; }   // "room" or "dialog" (lowercase)
    public required Guid ContextId { get; init; }
    public Guid? LastReadMessageId { get; set; }
    public DateTime LastReadAt { get; set; } = DateTime.UtcNow;

    public User User { get; init; } = null!;
}
```

- [ ] **Step 5: Update AppDbContext EF config for both entities**

In `src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs`, find and replace the `RoomBans` and `ReadMarkers` config blocks:

```csharp
// RoomBans
m.Entity<RoomBan>(e =>
{
    e.HasKey(b => b.Id);
    e.HasIndex(b => new { b.RoomId, b.BannedUserId }).HasFilter("\"RevokedAt\" IS NULL");
    e.Property(b => b.Reason).HasMaxLength(500);
    e.HasOne(b => b.Room).WithMany().HasForeignKey(b => b.RoomId).OnDelete(DeleteBehavior.Cascade);
    e.HasOne(b => b.BannedUser).WithMany().HasForeignKey(b => b.BannedUserId).OnDelete(DeleteBehavior.Cascade);
    e.HasOne(b => b.BannedByUser).WithMany().HasForeignKey(b => b.BannedByUserId).OnDelete(DeleteBehavior.Restrict);
    e.HasOne<User>().WithMany().HasForeignKey(b => b.RevokedByUserId).OnDelete(DeleteBehavior.SetNull);
});

// ReadMarkers
m.Entity<ReadMarker>(e =>
{
    e.HasKey(r => r.Id);
    e.HasIndex(r => new { r.UserId, r.ContextType, r.ContextId }).IsUnique();
    e.Property(r => r.ContextType).HasMaxLength(10).IsRequired();
    e.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
});
```

- [ ] **Step 6: Generate migration**

```bash
dotnet ef migrations add FixEntityDiscrepancies \
  --project src/ChatHerder.Infrastructure \
  --startup-project src/ChatHerder.API \
  --output-dir Migrations
```

- [ ] **Step 7: Run tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --logger "console;verbosity=minimal"
dotnet build ChatHerder.sln -c Debug
```

Expected: All unit tests pass; 0 build errors

- [ ] **Step 8: Commit**

```bash
git add src/ChatHerder.Domain/Entities/RoomBan.cs \
        src/ChatHerder.Domain/Entities/ReadMarker.cs \
        src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs \
        src/ChatHerder.Infrastructure/Migrations/ \
        tests/ChatHerder.Unit.Tests/Domain/EntityShapeTests.cs
git commit -m "fix: rename RoomBan.UserId→BannedUserId, ReadMarker to string ContextType + LastReadMessageId"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `GET /users/me`, `PATCH /users/me`, `GET /users/by-username` | Task 6 |
| Rooms CRUD + join/leave + members + message history | Task 7 |
| Room admin: ban/unban/promote/demote/delete-message | Task 7 |
| Room invitations: 5 routes | Task 8 |
| `PATCH /messages/{id}` + `DELETE /messages/{id}` | Task 8 |
| `GET /unread`, `POST /rooms/{id}/read`, `POST /dialogs/{id}/read` | Task 9 |
| IPresenceStore + IUnreadStore ports | Task 3 |
| RedisPresenceStore + RedisUnreadStore | Task 4 |
| PresenceMonitorService (20s ghost-cleanup) | Task 5 |
| Entity fix: AttachmentId/EditedAt/DeletedByUserId | Task 2 |
| xUnit test projects wired to solution | Task 1 |
| TDD (RED→GREEN per task) | All tasks |

**Not in this plan (Phase 4b):** PresenceHub, ChatHub, SignalR Redis backplane, dialog endpoints (Friends, Blocks, DMs).

---

Plan complete and saved to `docs/superpowers/plans/2026-04-18-phase4a-rooms-rest.md`.
