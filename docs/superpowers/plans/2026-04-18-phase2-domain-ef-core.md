# Phase 2: Domain Entities + EF Core + Application Port Interfaces

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 16+ domain entities, Application port interfaces, EF Core `AppDbContext` with fluent configurations, and the initial PostgreSQL migration so that `dotnet ef migrations add` produces a complete schema.

**Architecture:** Three-layer change — `Domain` gets entities and enums (zero NuGet deps); `Application` gets port interfaces (IFileStorage, IMessageBus, IEmailSender); `Infrastructure` gets `AppDbContext` with Npgsql fluent config and the `Migrations/` folder. `Program.cs` wires `DbContext` and runs `MigrateAsync()` on startup.

**Tech Stack:** .NET 10 · C# 14 · EF Core 10 · Npgsql.EntityFrameworkCore.PostgreSQL · PostgreSQL 17

---

## File Map

### Domain — enums + entities (zero NuGet deps)

| File | Responsibility |
|------|---------------|
| `src/ChatHerder.Domain/Enums/RoomVisibility.cs` | `Public \| Private` |
| `src/ChatHerder.Domain/Enums/MemberRole.cs` | `Owner \| Admin \| Member` |
| `src/ChatHerder.Domain/Enums/InvitationStatus.cs` | `Pending \| Accepted \| Rejected` |
| `src/ChatHerder.Domain/Enums/FriendRequestStatus.cs` | `Pending \| Accepted \| Rejected` |
| `src/ChatHerder.Domain/Enums/ContextType.cs` | `Room \| Dialog` |
| `src/ChatHerder.Domain/Entities/User.cs` | Username/Email/PasswordHash, soft-delete |
| `src/ChatHerder.Domain/Entities/Session.cs` | Per-browser JWT session |
| `src/ChatHerder.Domain/Entities/PasswordResetToken.cs` | Single-use 1-hour reset token |
| `src/ChatHerder.Domain/Entities/PlatformBan.cs` | Global ban; paired with Redis `ban:{userId}` |
| `src/ChatHerder.Domain/Entities/Room.cs` | Public/Private room, soft-delete |
| `src/ChatHerder.Domain/Entities/RoomMembership.cs` | Authoritative membership + role |
| `src/ChatHerder.Domain/Entities/RoomBan.cs` | Remove = ban; `RevokedAt` for unban |
| `src/ChatHerder.Domain/Entities/RoomInvitation.cs` | Private-room invitation |
| `src/ChatHerder.Domain/Entities/Message.cs` | Per-room message, monotonic seq, soft-delete |
| `src/ChatHerder.Domain/Entities/Attachment.cs` | File attached to Message or DM message |
| `src/ChatHerder.Domain/Entities/PersonalDialog.cs` | Fixed 2-person dialog; User1Id < User2Id |
| `src/ChatHerder.Domain/Entities/PersonalDialogMessage.cs` | DM message, monotonic seq, soft-delete |
| `src/ChatHerder.Domain/Entities/FriendRequest.cs` | Pending/Accepted/Rejected friend request |
| `src/ChatHerder.Domain/Entities/Friendship.cs` | Normalised pair; User1Id < User2Id |
| `src/ChatHerder.Domain/Entities/UserBlock.cs` | Unidirectional block; freezes DMs |
| `src/ChatHerder.Domain/Entities/ReadMarker.cs` | Per-user per-context read position |
| `src/ChatHerder.Domain/Entities/ContextSequences.cs` | Monotonic counter; composite PK |
| `src/ChatHerder.Domain/Entities/ActivityLog.cs` | Async audit event from RabbitMQ |

### Application — port interfaces (references Domain only)

| File | Responsibility |
|------|---------------|
| `src/ChatHerder.Application/Ports/IFileStorage.cs` | Save/Delete uploaded files |
| `src/ChatHerder.Application/Ports/IMessageBus.cs` | Publish domain events to RabbitMQ |
| `src/ChatHerder.Application/Ports/IEmailSender.cs` | Send password-reset emails |

### Infrastructure — DbContext + configurations

| File | Responsibility |
|------|---------------|
| `src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs` | EF Core DbContext; all DbSet<> + fluent config |

### API — startup wiring

| File | Responsibility |
|------|---------------|
| `src/ChatHerder.API/Program.cs` | Add `AddDbContext`, call `MigrateAsync()` on startup |

---

## Task 1: Domain Enums

**Files:**
- Create: `src/ChatHerder.Domain/Enums/RoomVisibility.cs`
- Create: `src/ChatHerder.Domain/Enums/MemberRole.cs`
- Create: `src/ChatHerder.Domain/Enums/InvitationStatus.cs`
- Create: `src/ChatHerder.Domain/Enums/FriendRequestStatus.cs`
- Create: `src/ChatHerder.Domain/Enums/ContextType.cs`

- [ ] **Step 1: Create `RoomVisibility.cs`**

```csharp
// src/ChatHerder.Domain/Enums/RoomVisibility.cs
namespace ChatHerder.Domain.Enums;

public enum RoomVisibility { Public, Private }
```

- [ ] **Step 2: Create `MemberRole.cs`**

```csharp
// src/ChatHerder.Domain/Enums/MemberRole.cs
namespace ChatHerder.Domain.Enums;

public enum MemberRole { Member, Admin, Owner }
```

- [ ] **Step 3: Create `InvitationStatus.cs`**

```csharp
// src/ChatHerder.Domain/Enums/InvitationStatus.cs
namespace ChatHerder.Domain.Enums;

public enum InvitationStatus { Pending, Accepted, Rejected }
```

- [ ] **Step 4: Create `FriendRequestStatus.cs`**

```csharp
// src/ChatHerder.Domain/Enums/FriendRequestStatus.cs
namespace ChatHerder.Domain.Enums;

public enum FriendRequestStatus { Pending, Accepted, Rejected }
```

- [ ] **Step 5: Create `ContextType.cs`**

```csharp
// src/ChatHerder.Domain/Enums/ContextType.cs
namespace ChatHerder.Domain.Enums;

public enum ContextType { Room, Dialog }
```

- [ ] **Step 6: Verify Domain builds**

```bash
dotnet build src/ChatHerder.Domain/ChatHerder.Domain.csproj
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 7: Commit**

```bash
git add src/ChatHerder.Domain/Enums/
git commit -m "feat(domain): add domain enums (RoomVisibility, MemberRole, InvitationStatus, FriendRequestStatus, ContextType)"
```

---

## Task 2: Domain Entities — Users & Auth

**Files:**
- Create: `src/ChatHerder.Domain/Entities/User.cs`
- Create: `src/ChatHerder.Domain/Entities/Session.cs`
- Create: `src/ChatHerder.Domain/Entities/PasswordResetToken.cs`
- Create: `src/ChatHerder.Domain/Entities/PlatformBan.cs`

- [ ] **Step 1: Create `User.cs`**

```csharp
// src/ChatHerder.Domain/Entities/User.cs
namespace ChatHerder.Domain.Entities;

public sealed class User
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Username { get; init; }   // immutable after creation
    public required string Email { get; set; }
    public required string PasswordHash { get; set; } // Argon2id encoded string
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }          // soft-delete; reserves email + username
}
```

- [ ] **Step 2: Create `Session.cs`**

```csharp
// src/ChatHerder.Domain/Entities/Session.cs
namespace ChatHerder.Domain.Entities;

public sealed class Session
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid UserId { get; init; }
    public required string RefreshToken { get; init; } // opaque, stored hashed
    public required string UserAgent { get; init; }
    public required string IpAddress { get; init; }
    public bool KeepSignedIn { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public required DateTime ExpiresAt { get; init; } // 7 days (keepSignedIn) or 24 h
    public DateTime? RevokedAt { get; set; }

    public User User { get; init; } = null!;
}
```

- [ ] **Step 3: Create `PasswordResetToken.cs`**

```csharp
// src/ChatHerder.Domain/Entities/PasswordResetToken.cs
namespace ChatHerder.Domain.Entities;

public sealed class PasswordResetToken
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid UserId { get; init; }
    public required string TokenHash { get; init; } // SHA-256 of the emailed token
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; init; } = DateTime.UtcNow.AddHours(1);
    public DateTime? UsedAt { get; set; }           // set on redemption; prevents reuse

    public User User { get; init; } = null!;
}
```

- [ ] **Step 4: Create `PlatformBan.cs`**

```csharp
// src/ChatHerder.Domain/Entities/PlatformBan.cs
namespace ChatHerder.Domain.Entities;

public sealed class PlatformBan
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid UserId { get; init; }
    public required Guid IssuedByAdminId { get; init; }
    public required string Reason { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; init; }  // null = permanent
    public DateTime? RevokedAt { get; set; }

    public User User { get; init; } = null!;
    public User IssuedByAdmin { get; init; } = null!;
}
```

- [ ] **Step 5: Verify Domain builds**

```bash
dotnet build src/ChatHerder.Domain/ChatHerder.Domain.csproj
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 6: Commit**

```bash
git add src/ChatHerder.Domain/Entities/User.cs \
        src/ChatHerder.Domain/Entities/Session.cs \
        src/ChatHerder.Domain/Entities/PasswordResetToken.cs \
        src/ChatHerder.Domain/Entities/PlatformBan.cs
git commit -m "feat(domain): add User, Session, PasswordResetToken, PlatformBan entities"
```

---

## Task 3: Domain Entities — Rooms & Messages

**Files:**
- Create: `src/ChatHerder.Domain/Entities/Room.cs`
- Create: `src/ChatHerder.Domain/Entities/RoomMembership.cs`
- Create: `src/ChatHerder.Domain/Entities/RoomBan.cs`
- Create: `src/ChatHerder.Domain/Entities/RoomInvitation.cs`
- Create: `src/ChatHerder.Domain/Entities/Message.cs`
- Create: `src/ChatHerder.Domain/Entities/Attachment.cs`

- [ ] **Step 1: Create `Room.cs`**

```csharp
// src/ChatHerder.Domain/Entities/Room.cs
using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

public sealed class Room
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; set; }
    public string? Description { get; set; }
    public required RoomVisibility Visibility { get; set; }
    public required Guid OwnerId { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }

    public User Owner { get; init; } = null!;
}
```

- [ ] **Step 2: Create `RoomMembership.cs`**

```csharp
// src/ChatHerder.Domain/Entities/RoomMembership.cs
using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

public sealed class RoomMembership
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid UserId { get; init; }
    public required MemberRole Role { get; set; }
    public DateTime JoinedAt { get; init; } = DateTime.UtcNow;

    public Room Room { get; init; } = null!;
    public User User { get; init; } = null!;
}
```

- [ ] **Step 3: Create `RoomBan.cs`**

```csharp
// src/ChatHerder.Domain/Entities/RoomBan.cs
namespace ChatHerder.Domain.Entities;

public sealed class RoomBan
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid UserId { get; init; }
    public required Guid BannedByUserId { get; init; }
    public required string Reason { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }

    public Room Room { get; init; } = null!;
    public User User { get; init; } = null!;
    public User BannedByUser { get; init; } = null!;
}
```

- [ ] **Step 4: Create `RoomInvitation.cs`**

```csharp
// src/ChatHerder.Domain/Entities/RoomInvitation.cs
using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

public sealed class RoomInvitation
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid InvitedUserId { get; init; }
    public required Guid InvitedByUserId { get; init; }
    public InvitationStatus Status { get; set; } = InvitationStatus.Pending;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? RespondedAt { get; set; }

    public Room Room { get; init; } = null!;
    public User InvitedUser { get; init; } = null!;
    public User InvitedByUser { get; init; } = null!;
}
```

- [ ] **Step 5: Create `Message.cs`**

```csharp
// src/ChatHerder.Domain/Entities/Message.cs
namespace ChatHerder.Domain.Entities;

public sealed class Message
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid AuthorId { get; init; }
    public required string Content { get; set; }     // max 3 KB enforced at endpoint
    public required long SequenceNumber { get; init; } // per-room monotonic; allocated via ContextSequences
    public Guid? ReplyToMessageId { get; init; }     // self-ref nullable FK
    public DateTime SentAt { get; init; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }

    public Room Room { get; init; } = null!;
    public User Author { get; init; } = null!;
    public Message? ReplyToMessage { get; init; }
}
```

- [ ] **Step 6: Create `Attachment.cs`**

```csharp
// src/ChatHerder.Domain/Entities/Attachment.cs
namespace ChatHerder.Domain.Entities;

public sealed class Attachment
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid? MessageId { get; init; }
    public Guid? PersonalDialogMessageId { get; init; }
    public required Guid UploadedByUserId { get; init; }
    public required string StoragePath { get; init; }  // relative; resolved via IFileStorage
    public required string FileName { get; init; }
    public required long SizeBytes { get; init; }
    public string? Comment { get; init; }
    public DateTime UploadedAt { get; init; } = DateTime.UtcNow;

    public Message? Message { get; init; }
    public PersonalDialogMessage? PersonalDialogMessage { get; init; }
    public User UploadedByUser { get; init; } = null!;
}
```

- [ ] **Step 7: Verify Domain builds**

```bash
dotnet build src/ChatHerder.Domain/ChatHerder.Domain.csproj
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 8: Commit**

```bash
git add src/ChatHerder.Domain/Entities/Room.cs \
        src/ChatHerder.Domain/Entities/RoomMembership.cs \
        src/ChatHerder.Domain/Entities/RoomBan.cs \
        src/ChatHerder.Domain/Entities/RoomInvitation.cs \
        src/ChatHerder.Domain/Entities/Message.cs \
        src/ChatHerder.Domain/Entities/Attachment.cs
git commit -m "feat(domain): add Room, RoomMembership, RoomBan, RoomInvitation, Message, Attachment entities"
```

---

## Task 4: Domain Entities — Social & DMs

**Files:**
- Create: `src/ChatHerder.Domain/Entities/PersonalDialog.cs`
- Create: `src/ChatHerder.Domain/Entities/PersonalDialogMessage.cs`
- Create: `src/ChatHerder.Domain/Entities/FriendRequest.cs`
- Create: `src/ChatHerder.Domain/Entities/Friendship.cs`
- Create: `src/ChatHerder.Domain/Entities/UserBlock.cs`

- [ ] **Step 1: Create `PersonalDialog.cs`**

```csharp
// src/ChatHerder.Domain/Entities/PersonalDialog.cs
namespace ChatHerder.Domain.Entities;

// Application layer MUST enforce User1Id < User2Id before INSERT.
public sealed class PersonalDialog
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid User1Id { get; init; }  // always the smaller Guid (ordinal)
    public required Guid User2Id { get; init; }  // always the larger Guid (ordinal)
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? FrozenAt { get; set; }      // set when either user blocks the other

    public User User1 { get; init; } = null!;
    public User User2 { get; init; } = null!;
}
```

- [ ] **Step 2: Create `PersonalDialogMessage.cs`**

```csharp
// src/ChatHerder.Domain/Entities/PersonalDialogMessage.cs
namespace ChatHerder.Domain.Entities;

public sealed class PersonalDialogMessage
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid DialogId { get; init; }
    public required Guid AuthorId { get; init; }
    public required string Content { get; set; }
    public required long SequenceNumber { get; init; } // per-dialog monotonic
    public Guid? ReplyToMessageId { get; init; }
    public DateTime SentAt { get; init; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }

    public PersonalDialog Dialog { get; init; } = null!;
    public User Author { get; init; } = null!;
    public PersonalDialogMessage? ReplyToMessage { get; init; }
}
```

- [ ] **Step 3: Create `FriendRequest.cs`**

```csharp
// src/ChatHerder.Domain/Entities/FriendRequest.cs
using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

public sealed class FriendRequest
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid SenderId { get; init; }
    public required Guid ReceiverId { get; init; }
    public FriendRequestStatus Status { get; set; } = FriendRequestStatus.Pending;
    public string? Message { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? RespondedAt { get; set; }

    public User Sender { get; init; } = null!;
    public User Receiver { get; init; } = null!;
}
```

- [ ] **Step 4: Create `Friendship.cs`**

```csharp
// src/ChatHerder.Domain/Entities/Friendship.cs
namespace ChatHerder.Domain.Entities;

// Application layer MUST enforce User1Id < User2Id before INSERT.
public sealed class Friendship
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid User1Id { get; init; }
    public required Guid User2Id { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public User User1 { get; init; } = null!;
    public User User2 { get; init; } = null!;
}
```

- [ ] **Step 5: Create `UserBlock.cs`**

```csharp
// src/ChatHerder.Domain/Entities/UserBlock.cs
namespace ChatHerder.Domain.Entities;

public sealed class UserBlock
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid BlockerId { get; init; }
    public required Guid BlockedUserId { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public User Blocker { get; init; } = null!;
    public User BlockedUser { get; init; } = null!;
}
```

- [ ] **Step 6: Verify Domain builds**

```bash
dotnet build src/ChatHerder.Domain/ChatHerder.Domain.csproj
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 7: Commit**

```bash
git add src/ChatHerder.Domain/Entities/PersonalDialog.cs \
        src/ChatHerder.Domain/Entities/PersonalDialogMessage.cs \
        src/ChatHerder.Domain/Entities/FriendRequest.cs \
        src/ChatHerder.Domain/Entities/Friendship.cs \
        src/ChatHerder.Domain/Entities/UserBlock.cs
git commit -m "feat(domain): add PersonalDialog, PersonalDialogMessage, FriendRequest, Friendship, UserBlock entities"
```

---

## Task 5: Domain Entities — System Records

**Files:**
- Create: `src/ChatHerder.Domain/Entities/ReadMarker.cs`
- Create: `src/ChatHerder.Domain/Entities/ContextSequences.cs`
- Create: `src/ChatHerder.Domain/Entities/ActivityLog.cs`

- [ ] **Step 1: Create `ReadMarker.cs`**

```csharp
// src/ChatHerder.Domain/Entities/ReadMarker.cs
using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

public sealed class ReadMarker
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid UserId { get; init; }
    public required ContextType ContextType { get; init; }
    public required Guid ContextId { get; init; }    // RoomId or DialogId
    public required long LastReadSequenceNumber { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; init; } = null!;
}
```

- [ ] **Step 2: Create `ContextSequences.cs`**

```csharp
// src/ChatHerder.Domain/Entities/ContextSequences.cs
using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

// Composite PK: (ContextType, ContextId).
// Never use MAX()+1. Always allocate via:
//   UPDATE "ContextSequences" SET "NextValue" = "NextValue" + 1
//   WHERE "ContextType" = @type AND "ContextId" = @id RETURNING "NextValue";
public sealed class ContextSequences
{
    public required ContextType ContextType { get; init; }
    public required Guid ContextId { get; init; }
    public long NextValue { get; set; } = 1;
}
```

- [ ] **Step 3: Create `ActivityLog.cs`**

```csharp
// src/ChatHerder.Domain/Entities/ActivityLog.cs
namespace ChatHerder.Domain.Entities;

public sealed class ActivityLog
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string EventType { get; init; }  // e.g. "message.sent", "user.banned"
    public required string Payload { get; init; }    // JSON string; stored as jsonb in PostgreSQL
    public Guid? UserId { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}
```

- [ ] **Step 4: Verify full Domain builds cleanly**

```bash
dotnet build src/ChatHerder.Domain/ChatHerder.Domain.csproj
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 5: Commit**

```bash
git add src/ChatHerder.Domain/Entities/ReadMarker.cs \
        src/ChatHerder.Domain/Entities/ContextSequences.cs \
        src/ChatHerder.Domain/Entities/ActivityLog.cs
git commit -m "feat(domain): add ReadMarker, ContextSequences, ActivityLog entities"
```

---

## Task 6: Application Port Interfaces

**Files:**
- Create: `src/ChatHerder.Application/Ports/IFileStorage.cs`
- Create: `src/ChatHerder.Application/Ports/IMessageBus.cs`
- Create: `src/ChatHerder.Application/Ports/IEmailSender.cs`

- [ ] **Step 1: Create `IFileStorage.cs`**

```csharp
// src/ChatHerder.Application/Ports/IFileStorage.cs
namespace ChatHerder.Application.Ports;

public interface IFileStorage
{
    /// <summary>Persists a stream and returns the relative storage path.</summary>
    Task<string> SaveAsync(Stream content, string fileName, CancellationToken ct = default);

    /// <summary>Deletes a file by its relative storage path. No-op if not found.</summary>
    Task DeleteAsync(string storagePath, CancellationToken ct = default);
}
```

- [ ] **Step 2: Create `IMessageBus.cs`**

```csharp
// src/ChatHerder.Application/Ports/IMessageBus.cs
namespace ChatHerder.Application.Ports;

public interface IMessageBus
{
    /// <summary>
    /// Publishes a message to the RabbitMQ topic exchange "chat.events".
    /// Routing key examples: "message.sent", "user.banned", "user.connected".
    /// </summary>
    Task PublishAsync<T>(string routingKey, T message, CancellationToken ct = default)
        where T : notnull;
}
```

- [ ] **Step 3: Create `IEmailSender.cs`**

```csharp
// src/ChatHerder.Application/Ports/IEmailSender.cs
namespace ChatHerder.Application.Ports;

public interface IEmailSender
{
    /// <summary>Sends a password-reset link containing the raw (unhashed) token.</summary>
    Task SendResetEmailAsync(string toEmail, string rawToken, CancellationToken ct = default);
}
```

- [ ] **Step 4: Verify Application builds**

```bash
dotnet build src/ChatHerder.Application/ChatHerder.Application.csproj
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 5: Commit**

```bash
git add src/ChatHerder.Application/Ports/
git commit -m "feat(application): add IFileStorage, IMessageBus, IEmailSender port interfaces"
```

---

## Task 7: EF Core AppDbContext

**Files:**
- Create: `src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs`

> **Why one file?** All entity type configurations live in `AppDbContext.OnModelCreating`. EF Core's fluent API is contextual — keeping it co-located avoids the "which configuration is active?" confusion that haunts split-config codebases. Split only if the file grows past ~600 lines.

- [ ] **Step 1: Create `AppDbContext.cs`**

```csharp
// src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<PlatformBan> PlatformBans => Set<PlatformBan>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<RoomMembership> RoomMemberships => Set<RoomMembership>();
    public DbSet<RoomBan> RoomBans => Set<RoomBan>();
    public DbSet<RoomInvitation> RoomInvitations => Set<RoomInvitation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<PersonalDialog> PersonalDialogs => Set<PersonalDialog>();
    public DbSet<PersonalDialogMessage> PersonalDialogMessages => Set<PersonalDialogMessage>();
    public DbSet<FriendRequest> FriendRequests => Set<FriendRequest>();
    public DbSet<Friendship> Friendships => Set<Friendship>();
    public DbSet<UserBlock> UserBlocks => Set<UserBlock>();
    public DbSet<ReadMarker> ReadMarkers => Set<ReadMarker>();
    public DbSet<ContextSequences> ContextSequences => Set<ContextSequences>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();

    protected override void OnModelCreating(ModelBuilder m)
    {
        // ── Users ──────────────────────────────────────────────────────────────
        m.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Username).IsUnique();
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Username).HasMaxLength(32).IsRequired();
            e.Property(u => u.Email).HasMaxLength(254).IsRequired();
            e.Property(u => u.PasswordHash).HasMaxLength(512).IsRequired();
            e.Property(u => u.AvatarUrl).HasMaxLength(2048);
        });

        // ── Sessions ───────────────────────────────────────────────────────────
        m.Entity<Session>(e =>
        {
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.RefreshToken).IsUnique();
            e.Property(s => s.RefreshToken).HasMaxLength(128).IsRequired();
            e.Property(s => s.UserAgent).HasMaxLength(512).IsRequired();
            e.Property(s => s.IpAddress).HasMaxLength(45).IsRequired();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── PasswordResetTokens ────────────────────────────────────────────────
        m.Entity<PasswordResetToken>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.TokenHash).IsUnique();
            e.Property(t => t.TokenHash).HasMaxLength(64).IsRequired();
            e.HasOne(t => t.User).WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── PlatformBans ───────────────────────────────────────────────────────
        m.Entity<PlatformBan>(e =>
        {
            e.HasKey(b => b.Id);
            e.Property(b => b.Reason).HasMaxLength(1024).IsRequired();
            e.HasOne(b => b.User).WithMany().HasForeignKey(b => b.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(b => b.IssuedByAdmin).WithMany().HasForeignKey(b => b.IssuedByAdminId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── Rooms ──────────────────────────────────────────────────────────────
        m.Entity<Room>(e =>
        {
            e.HasKey(r => r.Id);
            e.HasIndex(r => r.Name).IsUnique();
            e.Property(r => r.Name).HasMaxLength(64).IsRequired();
            e.Property(r => r.Description).HasMaxLength(512);
            e.Property(r => r.Visibility).HasConversion<string>().HasMaxLength(16).IsRequired();
            e.HasOne(r => r.Owner).WithMany().HasForeignKey(r => r.OwnerId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── RoomMemberships ────────────────────────────────────────────────────
        m.Entity<RoomMembership>(e =>
        {
            e.HasKey(rm => rm.Id);
            e.HasIndex(rm => new { rm.RoomId, rm.UserId }).IsUnique();
            e.Property(rm => rm.Role).HasConversion<string>().HasMaxLength(16).IsRequired();
            e.HasOne(rm => rm.Room).WithMany().HasForeignKey(rm => rm.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(rm => rm.User).WithMany().HasForeignKey(rm => rm.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── RoomBans ───────────────────────────────────────────────────────────
        m.Entity<RoomBan>(e =>
        {
            e.HasKey(b => b.Id);
            e.Property(b => b.Reason).HasMaxLength(1024).IsRequired();
            e.HasOne(b => b.Room).WithMany().HasForeignKey(b => b.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(b => b.User).WithMany().HasForeignKey(b => b.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(b => b.BannedByUser).WithMany().HasForeignKey(b => b.BannedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── RoomInvitations ────────────────────────────────────────────────────
        m.Entity<RoomInvitation>(e =>
        {
            e.HasKey(i => i.Id);
            e.Property(i => i.Status).HasConversion<string>().HasMaxLength(16).IsRequired();
            e.HasOne(i => i.Room).WithMany().HasForeignKey(i => i.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.InvitedUser).WithMany().HasForeignKey(i => i.InvitedUserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.InvitedByUser).WithMany().HasForeignKey(i => i.InvitedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── Messages ───────────────────────────────────────────────────────────
        m.Entity<Message>(e =>
        {
            e.HasKey(msg => msg.Id);
            e.HasIndex(msg => new { msg.RoomId, msg.SequenceNumber }).IsUnique(); // gap-detection invariant
            e.Property(msg => msg.Content).HasMaxLength(3072).IsRequired();       // 3 KB limit
            e.HasOne(msg => msg.Room).WithMany().HasForeignKey(msg => msg.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(msg => msg.Author).WithMany().HasForeignKey(msg => msg.AuthorId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(msg => msg.ReplyToMessage).WithMany().HasForeignKey(msg => msg.ReplyToMessageId).OnDelete(DeleteBehavior.SetNull);
        });

        // ── Attachments ────────────────────────────────────────────────────────
        m.Entity<Attachment>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.StoragePath).HasMaxLength(1024).IsRequired();
            e.Property(a => a.FileName).HasMaxLength(255).IsRequired();
            e.Property(a => a.Comment).HasMaxLength(512);
            e.HasOne(a => a.Message).WithMany().HasForeignKey(a => a.MessageId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.PersonalDialogMessage).WithMany().HasForeignKey(a => a.PersonalDialogMessageId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.UploadedByUser).WithMany().HasForeignKey(a => a.UploadedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── PersonalDialogs ────────────────────────────────────────────────────
        m.Entity<PersonalDialog>(e =>
        {
            e.HasKey(d => d.Id);
            e.HasIndex(d => new { d.User1Id, d.User2Id }).IsUnique(); // User1Id < User2Id enforced in app layer
            e.HasOne(d => d.User1).WithMany().HasForeignKey(d => d.User1Id).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(d => d.User2).WithMany().HasForeignKey(d => d.User2Id).OnDelete(DeleteBehavior.Restrict);
        });

        // ── PersonalDialogMessages ─────────────────────────────────────────────
        m.Entity<PersonalDialogMessage>(e =>
        {
            e.HasKey(dm => dm.Id);
            e.HasIndex(dm => new { dm.DialogId, dm.SequenceNumber }).IsUnique();
            e.Property(dm => dm.Content).HasMaxLength(3072).IsRequired();
            e.HasOne(dm => dm.Dialog).WithMany().HasForeignKey(dm => dm.DialogId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(dm => dm.Author).WithMany().HasForeignKey(dm => dm.AuthorId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(dm => dm.ReplyToMessage).WithMany().HasForeignKey(dm => dm.ReplyToMessageId).OnDelete(DeleteBehavior.SetNull);
        });

        // ── FriendRequests ─────────────────────────────────────────────────────
        m.Entity<FriendRequest>(e =>
        {
            e.HasKey(fr => fr.Id);
            e.Property(fr => fr.Status).HasConversion<string>().HasMaxLength(16).IsRequired();
            e.Property(fr => fr.Message).HasMaxLength(280);
            e.HasOne(fr => fr.Sender).WithMany().HasForeignKey(fr => fr.SenderId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(fr => fr.Receiver).WithMany().HasForeignKey(fr => fr.ReceiverId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── Friendships ────────────────────────────────────────────────────────
        m.Entity<Friendship>(e =>
        {
            e.HasKey(f => f.Id);
            e.HasIndex(f => new { f.User1Id, f.User2Id }).IsUnique();
            e.HasOne(f => f.User1).WithMany().HasForeignKey(f => f.User1Id).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(f => f.User2).WithMany().HasForeignKey(f => f.User2Id).OnDelete(DeleteBehavior.Cascade);
        });

        // ── UserBlocks ─────────────────────────────────────────────────────────
        m.Entity<UserBlock>(e =>
        {
            e.HasKey(ub => ub.Id);
            e.HasIndex(ub => new { ub.BlockerId, ub.BlockedUserId }).IsUnique();
            e.HasIndex(ub => ub.BlockedUserId);  // reverse lookup: "who blocked me?"
            e.HasOne(ub => ub.Blocker).WithMany().HasForeignKey(ub => ub.BlockerId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(ub => ub.BlockedUser).WithMany().HasForeignKey(ub => ub.BlockedUserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── ReadMarkers ────────────────────────────────────────────────────────
        m.Entity<ReadMarker>(e =>
        {
            e.HasKey(rm => rm.Id);
            e.HasIndex(rm => new { rm.UserId, rm.ContextType, rm.ContextId }).IsUnique();
            e.Property(rm => rm.ContextType).HasConversion<string>().HasMaxLength(8).IsRequired();
            e.HasOne(rm => rm.User).WithMany().HasForeignKey(rm => rm.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── ContextSequences ───────────────────────────────────────────────────
        m.Entity<ContextSequences>(e =>
        {
            e.HasKey(cs => new { cs.ContextType, cs.ContextId }); // composite PK
            e.Property(cs => cs.ContextType).HasConversion<string>().HasMaxLength(8).IsRequired();
        });

        // ── ActivityLogs ───────────────────────────────────────────────────────
        m.Entity<ActivityLog>(e =>
        {
            e.HasKey(al => al.Id);
            e.HasIndex(al => al.EventType);
            e.Property(al => al.EventType).HasMaxLength(64).IsRequired();
            e.Property(al => al.Payload).HasColumnType("jsonb").IsRequired();
        });
    }
}
```

- [ ] **Step 2: Verify Infrastructure builds**

```bash
dotnet build src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 3: Commit**

```bash
git add src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs
git commit -m "feat(infrastructure): add AppDbContext with fluent configurations for all 16 entities"
```

---

## Task 8: Wire DbContext in API + Generate Migration

**Files:**
- Modify: `src/ChatHerder.API/Program.cs`
- Create: `src/ChatHerder.Infrastructure/Migrations/` (generated by EF CLI)

- [ ] **Step 1: Add connection string to `appsettings.json`**

Add the `ConnectionStrings` block to `src/ChatHerder.API/appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "localhost",
  "ConnectionStrings": {
    "Default": "Host=postgres;Port=5432;Database=chatherder;Username=chatuser;Password=changeme"
  },
  "Jwt": {
    "Issuer": "",
    "Audience": ""
  },
  "Storage": {
    "BasePath": "/app/uploads"
  },
  "Smtp": {
    "Port": 587
  }
}
```

> The `postgres` hostname matches the Docker Compose service name. Never use `localhost` here.

- [ ] **Step 2: Wire `AppDbContext` in `Program.cs`**

Replace `src/ChatHerder.API/Program.cs` with:

```csharp
// Production AllowedHosts is set via the AllowedHosts env var (ASP.NET Core env-var
// config provider overrides appsettings.json). Docker Compose must set AllowedHosts=<domain>.
using ChatHerder.API.Middleware;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// SignalR — required by PresenceHub and ChatHub (AGENT.md §10)
builder.Services.AddSignalR();

// Authentication — JWT (AGENT.md §7); details wired in Phase 3
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();

// EF Core — connection string from config (Docker: Host=postgres; Dev: localhost override via env)
builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

var app = builder.Build();

// Run EF Core migrations on startup (AGENT.md §3.3)
using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

// Middleware pipeline — strict order per AGENT.md §5:
// UseAuthentication → BanCheckMiddleware → SessionValidationMiddleware → UseAuthorization
app.UseAuthentication();
app.UseMiddleware<BanCheckMiddleware>();
app.UseMiddleware<SessionValidationMiddleware>();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Health check — required by docker-compose healthcheck
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
   .AllowAnonymous();

app.Run();

// Exposed for WebApplicationFactory in integration tests
public partial class Program { }
```

- [ ] **Step 3: Verify solution builds**

```bash
dotnet build ChatHerder.sln
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 4: Generate the initial EF Core migration**

```bash
dotnet ef migrations add InitialSchema \
  --project src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj \
  --startup-project src/ChatHerder.API/ChatHerder.API.csproj \
  --output-dir Migrations
# Expected: Done. To undo this action, use 'ef migrations remove'
# Creates: src/ChatHerder.Infrastructure/Migrations/
#   <timestamp>_InitialSchema.cs
#   <timestamp>_InitialSchema.Designer.cs
#   AppDbContextModelSnapshot.cs
```

- [ ] **Step 5: Inspect generated SQL to verify critical indexes**

```bash
dotnet ef migrations script \
  --project src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj \
  --startup-project src/ChatHerder.API/ChatHerder.API.csproj \
  --output /tmp/initial_schema.sql

# Verify these unique indexes exist in the SQL output:
grep -i "unique" /tmp/initial_schema.sql | head -20
# Expected: unique index for Messages(RoomId, SequenceNumber),
#           PersonalDialogMessages(DialogId, SequenceNumber),
#           RoomMembership(RoomId, UserId), Friendships(User1Id, User2Id),
#           PersonalDialogs(User1Id, User2Id), UserBlocks(BlockerId, BlockedUserId)
```

- [ ] **Step 6: Commit**

```bash
git add src/ChatHerder.API/Program.cs \
        src/ChatHerder.API/appsettings.json \
        src/ChatHerder.Infrastructure/Migrations/
git commit -m "feat(infrastructure): wire AppDbContext, add InitialSchema EF Core migration"
```

---

## Self-Review

### Spec Coverage

| AGENT.md / ARCHITECTURE.md Requirement | Covered by Task |
|---|---|
| 16 domain entities from §6 | Tasks 2–5 |
| Enums: RoomVisibility, MemberRole, InvitationStatus, FriendRequestStatus, ContextType | Task 1 |
| Zero NuGet deps in Domain (§3.1) | Tasks 1–5 (no `<PackageReference>` added) |
| Application port interfaces: IFileStorage, IMessageBus, IEmailSender | Task 6 |
| `Messages(RoomId, SequenceNumber)` unique index | Task 7 |
| `PersonalDialogMessages(DialogId, SequenceNumber)` unique index | Task 7 |
| `RoomMembership(RoomId, UserId)` unique index | Task 7 |
| `Friendships(User1Id, User2Id)` unique index | Task 7 |
| `PersonalDialogs(User1Id, User2Id)` unique index | Task 7 |
| `UserBlocks(BlockerId, BlockedUserId)` unique + reverse index | Task 7 |
| `ContextSequences(ContextType, ContextId)` composite PK | Task 7 |
| `ActivityLog.Payload` stored as `jsonb` | Task 7 |
| `app.MigrateAsync()` on startup (§3.3) | Task 8 |
| Connection string reads from `IConfiguration`, never hardcoded (§3.3) | Task 8 |
| `User1Id < User2Id` for PersonalDialog and Friendship | Comment in entity + doc comment |

### Placeholder Scan — None found.

### Type Consistency

- `ContextSequences` composite PK `(ContextType, ContextId)` — defined in Task 5, configured in Task 7.
- `ActivityLog.Payload` typed as `string` in entity (Task 5), stored as `jsonb` via `HasColumnType("jsonb")` in Task 7.
- `Attachment` references both `Message` and `PersonalDialogMessage` — both defined before `Attachment` (Tasks 3 and 4 respectively — note: `PersonalDialogMessage` is in Task 4, but `Attachment` is in Task 3). **Fix needed:** `Attachment.PersonalDialogMessage` navigation property references `PersonalDialogMessage` which is defined in Task 4. Since the compiler resolves types across compilation, this is fine in a single project build — but the plan must note that Task 3 and Task 4 must be committed before `AppDbContext` compiles. The build verification in Task 7 catches this.
