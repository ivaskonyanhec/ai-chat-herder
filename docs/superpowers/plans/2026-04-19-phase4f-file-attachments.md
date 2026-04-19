# Phase 4f: File Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement file attachment upload/download and nightly orphan cleanup, then wire the upload button and file card rendering into the room-chat and DM composers.

**Architecture:** Upload is two-step: (1) `POST /api/files/upload` persists the file via `LocalFileStorage` and returns an `AttachmentDto` with an `id`; (2) the caller passes `attachmentId` in the next `SendMessage` or `SendDirectMessage` hub call. Download is authenticated — the Angular service fetches the file as a blob (with the Bearer token) then triggers a client-side download. `OrphanCleanupService` runs nightly and deletes unlinked attachments older than 24 h.

**Tech Stack:** .NET 10 Minimal APIs, EF Core InMemory (tests), NSubstitute (mocking IFileStorage/IFormFile), Angular 21 Signals, HttpClient, FormData, Blob URL download.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/ChatHerder.Application/Ports/IFileStorage.cs` | Add `OpenReadAsync` to the interface |
| Create | `src/ChatHerder.Infrastructure/Storage/LocalFileStorage.cs` | Disk-backed implementation of IFileStorage |
| Create | `tests/ChatHerder.Unit.Tests/Infrastructure/LocalFileStorageTests.cs` | Save / delete / no-op tests with temp dir |
| Create | `src/ChatHerder.API/Endpoints/FilesEndpoints.cs` | POST /files/upload + GET /files/{id} |
| Create | `tests/ChatHerder.Unit.Tests/Endpoints/FilesEndpointsTests.cs` | Size-limit + access-control unit tests |
| Create | `src/ChatHerder.Infrastructure/Services/OrphanCleanupService.cs` | Nightly BackgroundService (IServiceScopeFactory) |
| Create | `tests/ChatHerder.Unit.Tests/Services/OrphanCleanupServiceTests.cs` | Orphan deleted / linked preserved / recent spared |
| Modify | `src/ChatHerder.Infrastructure/InfrastructureExtensions.cs` | Register LocalFileStorage + OrphanCleanupService |
| Modify | `src/ChatHerder.API/Program.cs` | Mount `/api/files` endpoint group |
| Create | `frontend/src/app/core/files/files-api.service.ts` | Angular service: uploadFile + downloadFile |
| Create | `frontend/src/app/core/files/files-api.service.spec.ts` | HttpTestingController tests |
| Create | `frontend/src/app/core/files/files.models.ts` | `AttachmentDto` TypeScript interface |
| Modify | `frontend/src/app/features/rooms/room-chat/room-chat.ts` | pendingAttachmentId signal, upload, send with id |
| Modify | `frontend/src/app/features/rooms/room-chat/room-chat.html` | File button, attachment preview, file card in messages |
| Modify | `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts` | Same upload pattern for DMs |
| Modify | `frontend/src/app/features/dialogs/direct-messages/direct-messages.html` | File card in DM messages |

---

## Context Reference

### Existing types (do not redefine)

`AttachmentDto` — already in `src/ChatHerder.Application/DTOs/MessageDtos.cs`:
```csharp
public sealed record AttachmentDto(Guid Id, string FileName, string ContentType, long SizeBytes, string? Comment);
```

`Attachment` entity — `src/ChatHerder.Domain/Entities/Attachment.cs`:
```csharp
public sealed class Attachment
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid? MessageId { get; init; }
    public Guid? PersonalDialogMessageId { get; init; }
    public required Guid UploadedByUserId { get; init; }
    public required string StoragePath { get; init; }
    public required string FileName { get; init; }
    public required string ContentType { get; init; }
    public required long SizeBytes { get; init; }
    public string? Comment { get; init; }
    public DateTime UploadedAt { get; init; } = DateTime.UtcNow;
    // navigation props omitted
}
```

`PersonalDialogMessage.Dialog` — navigation property exists (type `PersonalDialog`). `PersonalDialog` has `User1Id` and `User2Id`.

Existing unit test pattern — `BuildContext()` + `InMemoryDatabase` + `internal static *Internal()` wrapper + reflection `GetProperty("StatusCode")?.GetValue(result)`.

`ChatService.sendMessage(roomId, content, replyToId, attachmentId)` and `sendDirectMessage(dialogId, content, replyToId, attachmentId)` already accept `string | null` attachment ids.

Storage config — `appsettings.json` already has `"Storage": { "BasePath": "/app/uploads" }`.

---

## Task 1: Extend IFileStorage + implement LocalFileStorage

**Files:**
- Modify: `src/ChatHerder.Application/Ports/IFileStorage.cs`
- Create: `src/ChatHerder.Infrastructure/Storage/LocalFileStorage.cs`
- Create: `tests/ChatHerder.Unit.Tests/Infrastructure/LocalFileStorageTests.cs`

- [ ] **Step 1: Write failing tests**

Create `tests/ChatHerder.Unit.Tests/Infrastructure/LocalFileStorageTests.cs`:

```csharp
using ChatHerder.Infrastructure.Storage;
using Microsoft.Extensions.Configuration;

namespace ChatHerder.Unit.Tests.Infrastructure;

public sealed class LocalFileStorageTests : IDisposable
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    private LocalFileStorage BuildStorage()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection([new KeyValuePair<string, string?>("Storage:BasePath", _tempDir)])
            .Build();
        return new LocalFileStorage(config);
    }

    [Fact]
    public async Task SaveAsync_CreatesFileAtReturnedRelativePath()
    {
        var storage = BuildStorage();
        await using var content = new MemoryStream("hello"u8.ToArray());

        var relPath = await storage.SaveAsync(content, "test.txt");

        Assert.True(File.Exists(Path.Combine(_tempDir, relPath)));
    }

    [Fact]
    public async Task DeleteAsync_RemovesFile()
    {
        var storage = BuildStorage();
        await using var content = new MemoryStream("hello"u8.ToArray());
        var relPath = await storage.SaveAsync(content, "test.txt");

        await storage.DeleteAsync(relPath);

        Assert.False(File.Exists(Path.Combine(_tempDir, relPath)));
    }

    [Fact]
    public async Task DeleteAsync_IsNoOp_WhenFileNotFound()
    {
        var storage = BuildStorage();
        await storage.DeleteAsync("nonexistent/file.txt"); // must not throw
    }

    [Fact]
    public async Task OpenReadAsync_ReturnsStreamWithOriginalContent()
    {
        var storage = BuildStorage();
        var bytes = "world"u8.ToArray();
        await using var content = new MemoryStream(bytes);
        var relPath = await storage.SaveAsync(content, "read.txt");

        await using var stream = await storage.OpenReadAsync(relPath);
        using var reader = new MemoryStream();
        await stream.CopyToAsync(reader);

        Assert.Equal(bytes, reader.ToArray());
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }
}
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "LocalFileStorageTests" -v minimal
```

Expected: compile error — `LocalFileStorage` type not found.

- [ ] **Step 3: Add OpenReadAsync to IFileStorage**

Replace `src/ChatHerder.Application/Ports/IFileStorage.cs` with:

```csharp
namespace ChatHerder.Application.Ports;

public interface IFileStorage
{
    /// <summary>Persists a stream and returns the relative storage path.</summary>
    Task<string> SaveAsync(Stream content, string fileName, CancellationToken ct = default);

    /// <summary>Deletes a file by its relative storage path. No-op if not found.</summary>
    Task DeleteAsync(string storagePath, CancellationToken ct = default);

    /// <summary>Opens a read stream for a file at the given relative storage path.</summary>
    Task<Stream> OpenReadAsync(string storagePath, CancellationToken ct = default);
}
```

- [ ] **Step 4: Create LocalFileStorage**

Create `src/ChatHerder.Infrastructure/Storage/LocalFileStorage.cs`:

```csharp
using ChatHerder.Application.Ports;
using Microsoft.Extensions.Configuration;

namespace ChatHerder.Infrastructure.Storage;

public sealed class LocalFileStorage(IConfiguration config) : IFileStorage
{
    private readonly string _basePath = config["Storage:BasePath"]
        ?? throw new InvalidOperationException("Storage:BasePath is not configured.");

    public async Task<string> SaveAsync(Stream content, string fileName, CancellationToken ct = default)
    {
        var relPath = Path.Combine(Guid.NewGuid().ToString("N"), Path.GetFileName(fileName));
        var fullPath = Path.Combine(_basePath, relPath);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        await using var file = File.Create(fullPath);
        await content.CopyToAsync(file, ct);
        return relPath;
    }

    public Task DeleteAsync(string storagePath, CancellationToken ct = default)
    {
        var fullPath = Path.Combine(_basePath, storagePath);
        if (File.Exists(fullPath)) File.Delete(fullPath);
        return Task.CompletedTask;
    }

    public Task<Stream> OpenReadAsync(string storagePath, CancellationToken ct = default)
    {
        var fullPath = Path.Combine(_basePath, storagePath);
        return Task.FromResult<Stream>(File.OpenRead(fullPath));
    }
}
```

- [ ] **Step 5: Run tests — confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "LocalFileStorageTests" -v minimal
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ChatHerder.Application/Ports/IFileStorage.cs \
        src/ChatHerder.Infrastructure/Storage/LocalFileStorage.cs \
        tests/ChatHerder.Unit.Tests/Infrastructure/LocalFileStorageTests.cs
git commit -m "feat: extend IFileStorage with OpenReadAsync + implement LocalFileStorage"
```

---

## Task 2: POST /files/upload endpoint

**Files:**
- Create: `src/ChatHerder.API/Endpoints/FilesEndpoints.cs`
- Create: `tests/ChatHerder.Unit.Tests/Endpoints/FilesEndpointsTests.cs` (upload tests only)

- [ ] **Step 1: Write failing tests**

Create `tests/ChatHerder.Unit.Tests/Endpoints/FilesEndpointsTests.cs`:

```csharp
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class FilesEndpointsTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new AppDbContext(opts);
    }

    private static ClaimsPrincipal Principal(Guid userId) =>
        new(new ClaimsIdentity([
            new Claim("user_id", userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test"));

    private static IFormFile MockFile(string contentType, long sizeBytes, string name = "file.dat")
    {
        var file = Substitute.For<IFormFile>();
        file.ContentType.Returns(contentType);
        file.Length.Returns(sizeBytes);
        file.FileName.Returns(name);
        file.OpenReadStream().Returns(new MemoryStream(new byte[sizeBytes > 100 ? 100 : (int)sizeBytes]));
        return file;
    }

    [Fact]
    public async Task UploadFile_Returns401_WhenNoClaim()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();
        var principal = new ClaimsPrincipal(new ClaimsIdentity());

        var result = await FilesEndpointsHelper.UploadFile(null, null, principal, db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(401, statusCode);
    }

    [Fact]
    public async Task UploadFile_Returns400_WhenNoFileProvided()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();

        var result = await FilesEndpointsHelper.UploadFile(null, null, Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(400, statusCode);
    }

    [Fact]
    public async Task UploadFile_Returns413_WhenImageExceeds3MB()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();
        var file = MockFile("image/jpeg", 4 * 1024 * 1024L); // 4 MB

        var result = await FilesEndpointsHelper.UploadFile(file, null, Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(413, statusCode);
    }

    [Fact]
    public async Task UploadFile_Returns413_WhenFileExceeds20MB()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();
        var file = MockFile("application/pdf", 21 * 1024 * 1024L); // 21 MB

        var result = await FilesEndpointsHelper.UploadFile(file, null, Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(413, statusCode);
    }

    [Fact]
    public async Task UploadFile_Returns201_AndCreatesAttachmentRow()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();
        storage.SaveAsync(Arg.Any<Stream>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
               .Returns("abc123/file.pdf");
        var userId = Guid.NewGuid();
        var file = MockFile("application/pdf", 1024L, "report.pdf");

        var result = await FilesEndpointsHelper.UploadFile(file, "Q4 report", Principal(userId), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(201, statusCode);

        var attachment = await db.Attachments.SingleAsync();
        Assert.Equal("report.pdf", attachment.FileName);
        Assert.Equal("Q4 report", attachment.Comment);
        Assert.Equal(userId, attachment.UploadedByUserId);
    }
}

internal static class FilesEndpointsHelper
{
    public static Task<IResult> UploadFile(
        IFormFile? file, string? comment, ClaimsPrincipal p,
        AppDbContext db, IFileStorage storage, CancellationToken ct)
        => ChatHerder.API.Endpoints.FilesEndpoints.UploadFileInternal(file, comment, p, db, storage, ct);

    public static Task<IResult> GetFile(
        Guid id, ClaimsPrincipal p,
        AppDbContext db, IFileStorage storage, CancellationToken ct)
        => ChatHerder.API.Endpoints.FilesEndpoints.GetFileInternal(id, p, db, storage, ct);
}
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "FilesEndpointsTests" -v minimal
```

Expected: compile error — `FilesEndpoints` type not found.

- [ ] **Step 3: Create FilesEndpoints.cs (upload only)**

Create `src/ChatHerder.API/Endpoints/FilesEndpoints.cs`:

```csharp
using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class FilesEndpoints
{
    private const long MaxImageBytes = 3L  * 1024 * 1024;  // 3 MB
    private const long MaxFileBytes  = 20L * 1024 * 1024;  // 20 MB

    public static RouteGroupBuilder MapFilesEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/upload", UploadFile).RequireAuthorization().DisableAntiforgery();
        group.MapGet("/{id:guid}", GetFile).RequireAuthorization();
        return group;
    }

    internal static Task<IResult> UploadFileInternal(
        IFormFile? file, string? comment, ClaimsPrincipal p,
        AppDbContext db, IFileStorage storage, CancellationToken ct)
        => UploadFile(file, comment, p, db, storage, ct);

    internal static Task<IResult> GetFileInternal(
        Guid id, ClaimsPrincipal p, AppDbContext db, IFileStorage storage, CancellationToken ct)
        => GetFile(id, p, db, storage, ct);

    private static async Task<IResult> UploadFile(
        IFormFile? file,
        [Microsoft.AspNetCore.Mvc.FromForm] string? comment,
        ClaimsPrincipal principal,
        AppDbContext db,
        IFileStorage storage,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        if (file is null)
            return Results.BadRequest(new { error = "No file provided." });

        var isImage = file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
        var limit   = isImage ? MaxImageBytes : MaxFileBytes;
        if (file.Length > limit)
            return Results.StatusCode(StatusCodes.Status413RequestEntityTooLarge);

        await using var stream = file.OpenReadStream();
        var relPath = await storage.SaveAsync(stream, file.FileName, ct);

        var attachment = new Attachment
        {
            UploadedByUserId = userId,
            StoragePath      = relPath,
            FileName         = file.FileName,
            ContentType      = file.ContentType,
            SizeBytes        = file.Length,
            Comment          = string.IsNullOrWhiteSpace(comment) ? null : comment,
        };
        db.Attachments.Add(attachment);
        await db.SaveChangesAsync(ct);

        return Results.Created(
            $"/api/files/{attachment.Id}",
            new AttachmentDto(attachment.Id, attachment.FileName, attachment.ContentType,
                              attachment.SizeBytes, attachment.Comment));
    }

    private static Task<IResult> GetFile(
        Guid id, ClaimsPrincipal principal, AppDbContext db, IFileStorage storage, CancellationToken ct)
        => Task.FromResult(Results.StatusCode(StatusCodes.Status501NotImplemented)); // implemented in Task 3
}
```

- [ ] **Step 4: Run tests — confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "FilesEndpointsTests" -v minimal
```

Expected: 5 tests pass (GetFile tests will compile but are not written yet).

- [ ] **Step 5: Commit**

```bash
git add src/ChatHerder.API/Endpoints/FilesEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/FilesEndpointsTests.cs
git commit -m "feat: POST /files/upload endpoint with size limits (TDD)"
```

---

## Task 3: GET /files/{id} — access control + streaming

**Files:**
- Modify: `src/ChatHerder.API/Endpoints/FilesEndpoints.cs` — replace stub GetFile
- Modify: `tests/ChatHerder.Unit.Tests/Endpoints/FilesEndpointsTests.cs` — add access-control tests

- [ ] **Step 1: Write failing tests**

Append to the test class in `FilesEndpointsTests.cs`:

```csharp
    [Fact]
    public async Task GetFile_Returns404_WhenAttachmentNotFound()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();

        var result = await FilesEndpointsHelper.GetFile(Guid.NewGuid(), Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(404, statusCode);
    }

    [Fact]
    public async Task GetFile_Returns403_WhenCallerIsNotRoomMember()
    {
        await using var db = BuildContext();
        var author = new User { Username = "a", Email = "a@x.com", PasswordHash = "x" };
        var caller = new User { Username = "b", Email = "b@x.com", PasswordHash = "x" };
        db.Users.AddRange(author, caller);
        var room = new Room { Name = "r", Visibility = Domain.Enums.RoomVisibility.Public, OwnerId = author.Id };
        db.Rooms.Add(room);
        var msg = new Message { RoomId = room.Id, AuthorId = author.Id, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        var att = new Attachment
        {
            MessageId = msg.Id, UploadedByUserId = author.Id,
            StoragePath = "a/f.txt", FileName = "f.txt", ContentType = "text/plain", SizeBytes = 10,
        };
        db.Attachments.Add(att);
        await db.SaveChangesAsync();
        var storage = Substitute.For<IFileStorage>();

        var result = await FilesEndpointsHelper.GetFile(att.Id, Principal(caller.Id), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(403, statusCode);
    }

    [Fact]
    public async Task GetFile_Returns403_WhenCallerIsBannedFromRoom()
    {
        await using var db = BuildContext();
        var author = new User { Username = "a", Email = "a@x.com", PasswordHash = "x" };
        var caller = new User { Username = "b", Email = "b@x.com", PasswordHash = "x" };
        db.Users.AddRange(author, caller);
        var room = new Room { Name = "r", Visibility = Domain.Enums.RoomVisibility.Public, OwnerId = author.Id };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = caller.Id, Role = Domain.Enums.MemberRole.Member });
        db.RoomBans.Add(new RoomBan { RoomId = room.Id, UserId = caller.Id, IssuedByUserId = author.Id, Reason = "test" });
        var msg = new Message { RoomId = room.Id, AuthorId = author.Id, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        var att = new Attachment
        {
            MessageId = msg.Id, UploadedByUserId = author.Id,
            StoragePath = "a/f.txt", FileName = "f.txt", ContentType = "text/plain", SizeBytes = 10,
        };
        db.Attachments.Add(att);
        await db.SaveChangesAsync();
        var storage = Substitute.For<IFileStorage>();

        var result = await FilesEndpointsHelper.GetFile(att.Id, Principal(caller.Id), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(403, statusCode);
    }

    [Fact]
    public async Task GetFile_Returns403_WhenCallerIsNotDialogParticipant()
    {
        await using var db = BuildContext();
        var u1 = new User { Username = "u1", Email = "u1@x.com", PasswordHash = "x" };
        var u2 = new User { Username = "u2", Email = "u2@x.com", PasswordHash = "x" };
        var stranger = new User { Username = "s", Email = "s@x.com", PasswordHash = "x" };
        db.Users.AddRange(u1, u2, stranger);
        var (lo, hi) = u1.Id < u2.Id ? (u1.Id, u2.Id) : (u2.Id, u1.Id);
        var dialog = new PersonalDialog { User1Id = lo, User2Id = hi };
        db.PersonalDialogs.Add(dialog);
        var dmMsg = new PersonalDialogMessage { DialogId = dialog.Id, AuthorId = u1.Id, Content = "hi", SequenceNumber = 1 };
        db.PersonalDialogMessages.Add(dmMsg);
        var att = new Attachment
        {
            PersonalDialogMessageId = dmMsg.Id, UploadedByUserId = u1.Id,
            StoragePath = "a/f.txt", FileName = "f.txt", ContentType = "text/plain", SizeBytes = 10,
        };
        db.Attachments.Add(att);
        await db.SaveChangesAsync();
        var storage = Substitute.For<IFileStorage>();

        var result = await FilesEndpointsHelper.GetFile(att.Id, Principal(stranger.Id), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(403, statusCode);
    }

    [Fact]
    public async Task GetFile_ReturnsFileStream_WhenCallerIsRoomMember()
    {
        await using var db = BuildContext();
        var author = new User { Username = "a", Email = "a@x.com", PasswordHash = "x" };
        var caller = new User { Username = "b", Email = "b@x.com", PasswordHash = "x" };
        db.Users.AddRange(author, caller);
        var room = new Room { Name = "r", Visibility = Domain.Enums.RoomVisibility.Public, OwnerId = author.Id };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = caller.Id, Role = Domain.Enums.MemberRole.Member });
        var msg = new Message { RoomId = room.Id, AuthorId = author.Id, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        var att = new Attachment
        {
            MessageId = msg.Id, UploadedByUserId = author.Id,
            StoragePath = "a/f.txt", FileName = "f.txt", ContentType = "text/plain", SizeBytes = 10,
        };
        db.Attachments.Add(att);
        await db.SaveChangesAsync();
        var storage = Substitute.For<IFileStorage>();
        storage.OpenReadAsync("a/f.txt", Arg.Any<CancellationToken>())
               .Returns(new MemoryStream("content"u8.ToArray()));

        var result = await FilesEndpointsHelper.GetFile(att.Id, Principal(caller.Id), db, storage, CancellationToken.None);

        // FileStreamHttpResult has StatusCode property returning 200
        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(200, statusCode);
    }
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "GetFile" -v minimal
```

Expected: all new GetFile tests fail (501 stub).

- [ ] **Step 3: Implement GetFile in FilesEndpoints.cs**

Replace the stub `GetFile` method:

```csharp
    private static async Task<IResult> GetFile(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        IFileStorage storage,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var attachment = await db.Attachments.FindAsync([id], ct);
        if (attachment is null) return Results.NotFound();

        if (attachment.MessageId.HasValue)
        {
            var msg = await db.Messages
                .FirstOrDefaultAsync(m => m.Id == attachment.MessageId, ct);
            if (msg is null) return Results.NotFound();

            var isMember = await db.RoomMemberships
                .AnyAsync(m => m.RoomId == msg.RoomId && m.UserId == callerId, ct);
            if (!isMember)
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var isBanned = await db.RoomBans
                .AnyAsync(b => b.RoomId == msg.RoomId && b.UserId == callerId && b.RevokedAt == null, ct);
            if (isBanned)
                return Results.StatusCode(StatusCodes.Status403Forbidden);
        }
        else if (attachment.PersonalDialogMessageId.HasValue)
        {
            var pdm = await db.PersonalDialogMessages
                .Include(m => m.Dialog)
                .FirstOrDefaultAsync(m => m.Id == attachment.PersonalDialogMessageId, ct);
            if (pdm is null) return Results.NotFound();

            if (pdm.Dialog.User1Id != callerId && pdm.Dialog.User2Id != callerId)
                return Results.StatusCode(StatusCodes.Status403Forbidden);
            // Frozen dialogs: allow download (no additional check per AGENT.md §13)
        }
        else
        {
            // Unlinked orphan — only the uploader may preview
            if (attachment.UploadedByUserId != callerId)
                return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        var stream = await storage.OpenReadAsync(attachment.StoragePath, ct);
        return Results.Stream(stream, attachment.ContentType, attachment.FileName);
    }
```

- [ ] **Step 4: Run ALL unit tests — confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ -v minimal
```

Expected: all tests pass (previous count + 5 new GetFile tests).

- [ ] **Step 5: Commit**

```bash
git add src/ChatHerder.API/Endpoints/FilesEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/FilesEndpointsTests.cs
git commit -m "feat: GET /files/{id} with room/dialog access control (TDD)"
```

---

## Task 4: OrphanCleanupService

**Files:**
- Create: `src/ChatHerder.Infrastructure/Services/OrphanCleanupService.cs`
- Create: `tests/ChatHerder.Unit.Tests/Services/OrphanCleanupServiceTests.cs`

- [ ] **Step 1: Write failing tests**

Create `tests/ChatHerder.Unit.Tests/Services/OrphanCleanupServiceTests.cs`:

```csharp
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using ChatHerder.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NSubstitute;

namespace ChatHerder.Unit.Tests.Services;

public sealed class OrphanCleanupServiceTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new AppDbContext(opts);
    }

    [Fact]
    public async Task RunCleanupCoreAsync_DeletesOrphanOlderThan24Hours()
    {
        await using var db = BuildContext();
        var user = new User { Username = "u", Email = "u@x.com", PasswordHash = "x" };
        db.Users.Add(user);
        var orphan = new Attachment
        {
            UploadedByUserId = user.Id,
            StoragePath      = "old/file.txt",
            FileName         = "file.txt",
            ContentType      = "text/plain",
            SizeBytes        = 100,
            UploadedAt       = DateTime.UtcNow.AddHours(-25),
        };
        db.Attachments.Add(orphan);
        await db.SaveChangesAsync();

        var storage = Substitute.For<IFileStorage>();
        var logger  = Substitute.For<ILogger<OrphanCleanupService>>();

        await OrphanCleanupService.RunCleanupCoreAsync(db, storage, logger, CancellationToken.None);

        Assert.Empty(await db.Attachments.ToListAsync());
        await storage.Received(1).DeleteAsync("old/file.txt", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RunCleanupCoreAsync_PreservesLinkedAttachment()
    {
        await using var db = BuildContext();
        var user = new User { Username = "u", Email = "u@x.com", PasswordHash = "x" };
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = user.Id };
        db.Users.Add(user);
        db.Rooms.Add(room);
        var msg = new Message { RoomId = room.Id, AuthorId = user.Id, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        var linked = new Attachment
        {
            MessageId        = msg.Id,
            UploadedByUserId = user.Id,
            StoragePath      = "linked/file.txt",
            FileName         = "file.txt",
            ContentType      = "text/plain",
            SizeBytes        = 100,
            UploadedAt       = DateTime.UtcNow.AddHours(-48),
        };
        db.Attachments.Add(linked);
        await db.SaveChangesAsync();

        var storage = Substitute.For<IFileStorage>();
        var logger  = Substitute.For<ILogger<OrphanCleanupService>>();

        await OrphanCleanupService.RunCleanupCoreAsync(db, storage, logger, CancellationToken.None);

        Assert.Single(await db.Attachments.ToListAsync());
        await storage.DidNotReceive().DeleteAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RunCleanupCoreAsync_PreservesRecentOrphan()
    {
        await using var db = BuildContext();
        var user = new User { Username = "u", Email = "u@x.com", PasswordHash = "x" };
        db.Users.Add(user);
        var recent = new Attachment
        {
            UploadedByUserId = user.Id,
            StoragePath      = "new/file.txt",
            FileName         = "file.txt",
            ContentType      = "text/plain",
            SizeBytes        = 100,
            UploadedAt       = DateTime.UtcNow.AddHours(-1), // only 1h old
        };
        db.Attachments.Add(recent);
        await db.SaveChangesAsync();

        var storage = Substitute.For<IFileStorage>();
        var logger  = Substitute.For<ILogger<OrphanCleanupService>>();

        await OrphanCleanupService.RunCleanupCoreAsync(db, storage, logger, CancellationToken.None);

        Assert.Single(await db.Attachments.ToListAsync());
        await storage.DidNotReceive().DeleteAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }
}
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "OrphanCleanupServiceTests" -v minimal
```

Expected: compile error — `OrphanCleanupService` type not found.

- [ ] **Step 3: Create OrphanCleanupService**

Create `src/ChatHerder.Infrastructure/Services/OrphanCleanupService.cs`:

```csharp
using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ChatHerder.Infrastructure.Services;

public sealed class OrphanCleanupService(
    IServiceScopeFactory scopeFactory,
    ILogger<OrphanCleanupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Initial delay so the host is fully started before first sweep
        await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope   = scopeFactory.CreateScope();
                var db            = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var storage       = scope.ServiceProvider.GetRequiredService<IFileStorage>();
                await RunCleanupCoreAsync(db, storage, logger, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "OrphanCleanupService sweep failed");
            }
            await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
        }
    }

    internal static async Task RunCleanupCoreAsync(
        AppDbContext db, IFileStorage storage, ILogger logger, CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddHours(-24);
        var orphans = await db.Attachments
            .Where(a => a.MessageId == null
                     && a.PersonalDialogMessageId == null
                     && a.UploadedAt < cutoff)
            .ToListAsync(ct);

        foreach (var orphan in orphans)
        {
            try
            {
                await storage.DeleteAsync(orphan.StoragePath, ct);
                db.Attachments.Remove(orphan);
                logger.LogInformation("Deleted orphan attachment {Id}", orphan.Id);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to delete orphan attachment {Id}", orphan.Id);
            }
        }
        await db.SaveChangesAsync(ct);
    }
}
```

- [ ] **Step 4: Run tests — confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "OrphanCleanupServiceTests" -v minimal
```

Expected: 3 tests pass.

- [ ] **Step 5: Run full suite — no regressions**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ -v minimal
```

- [ ] **Step 6: Commit**

```bash
git add src/ChatHerder.Infrastructure/Services/OrphanCleanupService.cs \
        tests/ChatHerder.Unit.Tests/Services/OrphanCleanupServiceTests.cs
git commit -m "feat: OrphanCleanupService — nightly deletion of unlinked attachments (TDD)"
```

---

## Task 5: Register in DI + wire Program.cs

**Files:**
- Modify: `src/ChatHerder.Infrastructure/InfrastructureExtensions.cs`
- Modify: `src/ChatHerder.API/Program.cs`

- [ ] **Step 1: Register LocalFileStorage and OrphanCleanupService**

In `src/ChatHerder.Infrastructure/InfrastructureExtensions.cs`, add these two lines after the existing `AddHostedService<PresenceMonitorService>()` line:

```csharp
        services.AddSingleton<IFileStorage, LocalFileStorage>();
        services.AddHostedService<OrphanCleanupService>();
```

Also add the missing using at the top of the file:

```csharp
using ChatHerder.Infrastructure.Storage;
```

Full updated file:

```csharp
using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Cache;
using ChatHerder.Infrastructure.Email;
using ChatHerder.Infrastructure.Persistence;
using ChatHerder.Infrastructure.Security;
using ChatHerder.Infrastructure.Services;
using ChatHerder.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;

namespace ChatHerder.Infrastructure;

public static class InfrastructureExtensions
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration config)
    {
        // EF Core
        services.AddDbContext<AppDbContext>(opts =>
            opts.UseNpgsql(config.GetConnectionString("Default")));

        // Redis — singleton; thread-safe multiplexer
        services.AddSingleton<IConnectionMultiplexer>(_ =>
            ConnectionMultiplexer.Connect(config["Redis:ConnectionString"]
                ?? throw new InvalidOperationException("Redis:ConnectionString is not configured.")));

        // JWT settings
        services.Configure<JwtSettings>(config.GetSection("Jwt"));

        // Infrastructure service registrations
        services.AddScoped<IPasswordHasher, ArgonPasswordHasher>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<ISessionStore, RedisSessionStore>();
        services.AddScoped<IEmailSender, SmtpEmailSender>();

        services.AddSingleton<IPresenceStore, RedisPresenceStore>();
        services.AddSingleton<IUnreadStore, RedisUnreadStore>();
        services.AddHostedService<PresenceMonitorService>();

        services.AddSingleton<IFileStorage, LocalFileStorage>();
        services.AddHostedService<OrphanCleanupService>();

        return services;
    }
}
```

- [ ] **Step 2: Mount the files endpoint group in Program.cs**

In `src/ChatHerder.API/Program.cs`, add one line after the existing `dm-messages` group:

```csharp
api.MapGroup("/files").MapFilesEndpoints();
```

The endpoint block in Program.cs should now look like:

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
api.MapGroup("/files").MapFilesEndpoints();
```

- [ ] **Step 3: Build solution — confirm 0 errors**

```bash
dotnet build ChatHerder.sln -v minimal 2>&1 | tail -5
```

Expected: `Build succeeded. 0 Error(s)`.

- [ ] **Step 4: Run all unit tests**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ -v minimal
```

Expected: all pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/ChatHerder.Infrastructure/InfrastructureExtensions.cs \
        src/ChatHerder.API/Program.cs
git commit -m "feat: register LocalFileStorage + OrphanCleanupService; mount /api/files"
```

---

## Task 6: Angular FilesApiService

**Files:**
- Create: `frontend/src/app/core/files/files.models.ts`
- Create: `frontend/src/app/core/files/files-api.service.ts`
- Create: `frontend/src/app/core/files/files-api.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/app/core/files/files-api.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { FilesApiService } from './files-api.service';
import type { AttachmentDto } from './files.models';

describe('FilesApiService', () => {
  let service: FilesApiService;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FilesApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FilesApiService);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('uploadFile posts FormData to /api/files/upload and returns AttachmentDto', () => {
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
    const expected: AttachmentDto = {
      id: 'aaa', fileName: 'test.txt', contentType: 'text/plain', sizeBytes: 5, comment: null,
    };
    let actual: AttachmentDto | undefined;

    service.uploadFile(file).subscribe(dto => (actual = dto));

    const req = controller.expectOne('/api/files/upload');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    req.flush(expected, { status: 201, statusText: 'Created' });
    expect(actual).toEqual(expected);
  });

  it('uploadFile includes optional comment in FormData', () => {
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' });

    service.uploadFile(file, 'Q4 Report').subscribe();

    const req = controller.expectOne('/api/files/upload');
    const fd = req.request.body as FormData;
    expect(fd.get('comment')).toBe('Q4 Report');
    req.flush({}, { status: 201, statusText: 'Created' });
  });

  it('getFileUrl returns the correct API path', () => {
    expect(service.getFileUrl('abc-123')).toBe('/api/files/abc-123');
  });
});
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
cd frontend && CI=1 npm test -- --testPathPattern="files-api" 2>&1 | tail -15
```

Expected: compile error — `FilesApiService` not found.

- [ ] **Step 3: Create files.models.ts**

Create `frontend/src/app/core/files/files.models.ts`:

```typescript
export interface AttachmentDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  comment: string | null;
}
```

- [ ] **Step 4: Create FilesApiService**

Create `frontend/src/app/core/files/files-api.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { AttachmentDto } from './files.models';

@Injectable({ providedIn: 'root' })
export class FilesApiService {
  private readonly http = inject(HttpClient);

  uploadFile(file: File, comment?: string): Observable<AttachmentDto> {
    const form = new FormData();
    form.append('file', file);
    if (comment) form.append('comment', comment);
    return this.http.post<AttachmentDto>('/api/files/upload', form);
  }

  /** Returns the authenticated download URL path (used with XHR download). */
  getFileUrl(attachmentId: string): string {
    return `/api/files/${attachmentId}`;
  }

  /** Fetches the file as a Blob and triggers a browser download. */
  downloadFile(attachmentId: string, fileName: string): void {
    this.http.get(this.getFileUrl(attachmentId), { responseType: 'blob' }).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}
```

- [ ] **Step 5: Run tests — confirm GREEN**

```bash
cd frontend && CI=1 npm test -- --testPathPattern="files-api" 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 6: Run full Angular test suite**

```bash
cd frontend && CI=1 npm test 2>&1 | tail -5
```

Expected: all previous tests still pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/files/
git commit -m "feat: FilesApiService — upload, getFileUrl, downloadFile"
```

---

## Task 7: Room-chat file upload + file card rendering

**Files:**
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.ts`
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.html`

- [ ] **Step 1: Update room-chat.ts**

Replace `frontend/src/app/features/rooms/room-chat/room-chat.ts` with:

```typescript
import { Component, OnInit, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { FormsModule } from '@angular/forms';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import type { RoomDto } from '../../../core/rooms/rooms.models';
import type { MessageDto } from '../../../core/signalr/hub.models';
import type { AttachmentDto } from '../../../core/files/files.models';

@Component({
  selector: 'app-room-chat',
  standalone: true,
  imports: [Button, Textarea, FormsModule],
  templateUrl: './room-chat.html',
  styleUrl: './room-chat.scss',
})
export class RoomChatComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly authSession = inject(AuthSessionService);
  private readonly roomsApi = inject(RoomsApiService);
  private readonly chat = inject(ChatService);
  private readonly presence = inject(PresenceService);
  private readonly filesApi = inject(FilesApiService);

  readonly user = this.authSession.user;
  readonly roomId = computed(() => this.route.snapshot.params['id'] as string);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly room = signal<RoomDto | null>(null);
  readonly messages = signal<MessageDto[]>([]);
  readonly messageText = signal('');
  readonly isSending = signal(false);
  readonly isUploading = signal(false);
  readonly pendingAttachment = signal<AttachmentDto | null>(null);

  constructor() {
    effect(() => {
      const event = this.chat.lastRoomEvent();
      if (!event) return;
      if (event.type === 'MessageReceived') {
        this.messages.update(msgs => [...msgs, event.payload]);
      } else if (event.type === 'MessageEdited') {
        this.messages.update(msgs => msgs.map(m => m.id === event.payload.id ? event.payload : m));
      } else if (event.type === 'MessageDeleted') {
        this.messages.update(msgs =>
          msgs.map(m => m.id === event.payload.messageId ? { ...m, isDeleted: true, content: null } : m));
      }
    });
  }

  ngOnInit(): void {
    const id = this.roomId();
    void this.presence.joinRoom(id);
    this.loadRoom(id);
  }

  ngOnDestroy(): void {
    void this.presence.leaveRoom(this.roomId());
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.uploadFile(file);
    input.value = '';
  }

  onPaste(event: ClipboardEvent): void {
    const file = event.clipboardData?.files[0];
    if (file) {
      event.preventDefault();
      this.uploadFile(file);
    }
  }

  clearAttachment(): void {
    this.pendingAttachment.set(null);
  }

  sendMessage(): void {
    const content = this.messageText().trim();
    const attachment = this.pendingAttachment();
    if ((!content && !attachment) || this.isSending()) return;
    this.isSending.set(true);
    void this.chat.sendMessage(this.roomId(), content || ' ', null, attachment?.id ?? null)
      .then(() => {
        this.messageText.set('');
        this.pendingAttachment.set(null);
      })
      .finally(() => this.isSending.set(false));
  }

  downloadFile(attachmentId: string, fileName: string): void {
    this.filesApi.downloadFile(attachmentId, fileName);
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  private uploadFile(file: File): void {
    if (this.isUploading()) return;
    this.isUploading.set(true);
    this.filesApi.uploadFile(file)
      .pipe(finalize(() => this.isUploading.set(false)))
      .subscribe({
        next: dto => this.pendingAttachment.set(dto),
        error: () => this.errorMessage.set('File upload failed.'),
      });
  }

  private loadRoom(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.roomsApi.getRoom(id).subscribe({
      next: room => {
        this.room.set(room);
        this.roomsApi.getMessages(id)
          .pipe(finalize(() => this.isLoading.set(false)))
          .subscribe({
            next: msgs => this.messages.set(msgs),
            error: () => this.errorMessage.set('Unable to load messages.'),
          });
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Room not found or access denied.');
      },
    });
  }
}
```

- [ ] **Step 2: Update room-chat.html — add file input, attachment preview, file card**

The key additions to the existing template are:

1. **Hidden file input** (before the composer toolbar):
```html
<input type="file" #fileInput hidden (change)="onFileSelected($event)" />
```

2. **Attachment preview chip** (above the textarea, show only when `pendingAttachment()` is set):
```html
@if (pendingAttachment()) {
  <div class="flex items-center gap-2 px-4 py-2 bg-primary-container/30 rounded-lg mx-4 mt-2 text-sm">
    <span class="material-symbols-outlined text-sm text-primary">attach_file</span>
    <span class="flex-1 truncate text-on-surface font-medium">{{ pendingAttachment()!.fileName }}</span>
    <span class="text-xs text-on-surface-variant">{{ formatSize(pendingAttachment()!.sizeBytes) }}</span>
    <button class="text-on-surface-variant hover:text-error ml-1" type="button" (click)="clearAttachment()">
      <span class="material-symbols-outlined text-sm">close</span>
    </button>
  </div>
}
@if (isUploading()) {
  <div class="px-4 py-1 text-xs text-on-surface-variant">Uploading…</div>
}
```

3. **Attach button** in the composer toolbar (next to the send button):
```html
<button type="button" class="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant"
        [disabled]="isUploading()" (click)="fileInput.click()">
  <span class="material-symbols-outlined text-lg">attach_file</span>
</button>
```

4. **File card** inside the `@for (msg of messages())` loop, after the message content:
```html
@if (msg.attachment) {
  <div class="flex items-center gap-3 mt-2 px-3 py-2 bg-surface-container rounded-lg max-w-xs">
    <span class="material-symbols-outlined text-on-surface-variant shrink-0">
      {{ msg.attachment.contentType.startsWith('image/') ? 'image' : 'attach_file' }}
    </span>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-on-surface truncate">{{ msg.attachment.fileName }}</p>
      @if (msg.attachment.comment) {
        <p class="text-xs text-on-surface-variant">{{ msg.attachment.comment }}</p>
      }
      <p class="text-xs text-on-surface-variant">{{ formatSize(msg.attachment.sizeBytes) }}</p>
    </div>
    <button type="button"
            class="p-1 rounded hover:bg-surface-container-high text-on-surface-variant"
            (click)="downloadFile(msg.attachment.id, msg.attachment.fileName)">
      <span class="material-symbols-outlined text-sm">download</span>
    </button>
  </div>
}
```

Also add `(paste)="onPaste($event)"` to the `<textarea>` or `<pTextarea>` element.

Full updated `room-chat.html` (preserve existing layout; insert the blocks above at the correct positions around the existing composer and message list):

```html
<div class="flex h-full bg-surface-container-lowest overflow-hidden" data-testid="chat-area">
  @if (isLoading()) {
    <div class="flex-1 flex items-center justify-center">
      <span class="material-symbols-outlined text-3xl text-outline animate-spin">progress_activity</span>
    </div>
  } @else {
    <!-- Left: message area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <div class="h-14 flex items-center px-4 border-b border-surface-container shrink-0">
        <span class="material-symbols-outlined text-on-surface-variant mr-2">tag</span>
        <span class="font-bold text-on-surface">{{ room()?.name ?? 'Loading…' }}</span>
      </div>

      @if (errorMessage()) {
        <p class="mx-4 mt-2 text-error text-sm">{{ errorMessage() }}</p>
      }

      <!-- Messages -->
      <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        @for (msg of messages(); track msg.id) {
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center shrink-0 text-xs font-bold text-on-primary-container">
              {{ msg.sender.username[0].toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 mb-0.5">
                <span class="text-sm font-bold text-on-surface">{{ msg.sender.username }}</span>
                <span class="text-xs text-on-surface-variant">{{ formatTime(msg.sentAt) }}</span>
              </div>
              @if (msg.isDeleted) {
                <p class="text-sm text-on-surface-variant italic">Message deleted</p>
              } @else {
                <p class="text-sm text-on-surface whitespace-pre-wrap break-words">{{ msg.content }}</p>
                @if (msg.attachment) {
                  <div class="flex items-center gap-3 mt-2 px-3 py-2 bg-surface-container rounded-lg max-w-xs">
                    <span class="material-symbols-outlined text-on-surface-variant shrink-0">
                      {{ msg.attachment.contentType.startsWith('image/') ? 'image' : 'attach_file' }}
                    </span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-on-surface truncate">{{ msg.attachment.fileName }}</p>
                      @if (msg.attachment.comment) {
                        <p class="text-xs text-on-surface-variant">{{ msg.attachment.comment }}</p>
                      }
                      <p class="text-xs text-on-surface-variant">{{ formatSize(msg.attachment.sizeBytes) }}</p>
                    </div>
                    <button type="button"
                            class="p-1 rounded hover:bg-surface-container-high text-on-surface-variant"
                            (click)="downloadFile(msg.attachment.id, msg.attachment.fileName)">
                      <span class="material-symbols-outlined text-sm">download</span>
                    </button>
                  </div>
                }
              }
            </div>
          </div>
        }
      </div>

      <!-- Attachment preview -->
      @if (pendingAttachment()) {
        <div class="flex items-center gap-2 px-4 py-2 bg-primary-container/30 rounded-lg mx-4 mb-1 text-sm">
          <span class="material-symbols-outlined text-sm text-primary">attach_file</span>
          <span class="flex-1 truncate text-on-surface font-medium">{{ pendingAttachment()!.fileName }}</span>
          <span class="text-xs text-on-surface-variant">{{ formatSize(pendingAttachment()!.sizeBytes) }}</span>
          <button class="text-on-surface-variant hover:text-error" type="button" (click)="clearAttachment()">
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      }
      @if (isUploading()) {
        <p class="px-4 pb-1 text-xs text-on-surface-variant">Uploading…</p>
      }

      <!-- Composer -->
      <div class="px-4 py-3 bg-surface-container-low shrink-0">
        <input type="file" #fileInput hidden (change)="onFileSelected($event)" />
        <div class="flex items-end gap-2">
          <button type="button"
                  class="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant shrink-0"
                  [disabled]="isUploading()"
                  (click)="fileInput.click()">
            <span class="material-symbols-outlined">attach_file</span>
          </button>
          <textarea
            pTextarea
            class="flex-1 bg-surface-container rounded-lg px-3 py-2 text-sm text-on-surface outline-none resize-none min-h-[40px] max-h-32"
            placeholder="Message…"
            [ngModel]="messageText()"
            (ngModelChange)="messageText.set($event)"
            (paste)="onPaste($event)"
            data-testid="message-input"
            (keydown.enter)="$event.preventDefault(); sendMessage()"
          ></textarea>
          <button
            type="button"
            class="p-2 rounded-lg bg-primary text-on-primary hover:bg-primary-dim shrink-0 disabled:opacity-50"
            [disabled]="isSending() || isUploading()"
            (click)="sendMessage()">
            <span class="material-symbols-outlined">send</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Right: members panel -->
    <div class="w-56 border-l border-surface-container bg-surface-container-low shrink-0 overflow-y-auto hidden lg:block">
      <div class="p-4">
        <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Members</p>
      </div>
    </div>
  }
</div>
```

- [ ] **Step 3: Run Angular tests — confirm no regressions**

```bash
cd frontend && CI=1 npm test 2>&1 | tail -5
```

Expected: all tests pass (the room-chat spec tests component creation, not upload logic, so no new tests needed at this step).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/rooms/room-chat/room-chat.ts \
        frontend/src/app/features/rooms/room-chat/room-chat.html
git commit -m "feat: room-chat file upload button, clipboard paste, attachment preview, file card"
```

---

## Task 8: DM composer file upload + file card

**Files:**
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts`
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.html`

- [ ] **Step 1: Update direct-messages.ts**

Add these imports and signals to the existing component (minimal diff — only what changes):

Add to imports block:
```typescript
import { FilesApiService } from '../../../core/files/files-api.service';
import type { AttachmentDto } from '../../../core/files/files.models';
```

Add `filesApi` injection after the existing injections:
```typescript
private readonly filesApi = inject(FilesApiService);
```

Add signals after `isSending`:
```typescript
readonly isUploading = signal(false);
readonly pendingAttachment = signal<AttachmentDto | null>(null);
```

Add these methods:
```typescript
onFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) this.uploadFile(file);
  input.value = '';
}

onPaste(event: ClipboardEvent): void {
  const file = event.clipboardData?.files[0];
  if (file) {
    event.preventDefault();
    this.uploadFile(file);
  }
}

clearAttachment(): void {
  this.pendingAttachment.set(null);
}

downloadFile(attachmentId: string, fileName: string): void {
  this.filesApi.downloadFile(attachmentId, fileName);
}

formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

private uploadFile(file: File): void {
  if (this.isUploading()) return;
  this.isUploading.set(true);
  this.filesApi.uploadFile(file)
    .pipe(finalize(() => this.isUploading.set(false)))
    .subscribe({
      next: dto => this.pendingAttachment.set(dto),
      error: () => this.errorMessage.set('File upload failed.'),
    });
}
```

Update the existing `sendMessage()` to include the pending attachment:

```typescript
sendMessage(): void {
  const content = this.messageText().trim();
  const attachment = this.pendingAttachment();
  const dialog = this.selectedDialog();
  if ((!content && !attachment) || !dialog || this.isSending()) return;
  this.isSending.set(true);
  void this.chat.sendDirectMessage(dialog.id, content || ' ', null, attachment?.id ?? null)
    .then(() => {
      this.messageText.set('');
      this.pendingAttachment.set(null);
    })
    .finally(() => this.isSending.set(false));
}
```

- [ ] **Step 2: Add file card + upload controls to direct-messages.html**

In the DM message list, inside the `@for (msg of messages(); ...)` loop, add after the message text:

```html
@if (msg.attachment) {
  <div class="flex items-center gap-3 mt-2 px-3 py-2 bg-surface-container rounded-lg max-w-xs">
    <span class="material-symbols-outlined text-on-surface-variant shrink-0">
      {{ msg.attachment.contentType.startsWith('image/') ? 'image' : 'attach_file' }}
    </span>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-on-surface truncate">{{ msg.attachment.fileName }}</p>
      @if (msg.attachment.comment) {
        <p class="text-xs text-on-surface-variant">{{ msg.attachment.comment }}</p>
      }
      <p class="text-xs text-on-surface-variant">{{ formatSize(msg.attachment.sizeBytes) }}</p>
    </div>
    <button type="button"
            class="p-1 rounded hover:bg-surface-container-high text-on-surface-variant"
            (click)="downloadFile(msg.attachment.id, msg.attachment.fileName)">
      <span class="material-symbols-outlined text-sm">download</span>
    </button>
  </div>
}
```

In the DM composer section, add before the existing textarea:

```html
<input type="file" #dmFileInput hidden (change)="onFileSelected($event)" />
```

Add the attach button next to the send button:
```html
<button type="button"
        class="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant"
        [disabled]="isUploading()"
        (click)="dmFileInput.click()">
  <span class="material-symbols-outlined">attach_file</span>
</button>
```

Add attachment preview above the composer (same pattern as room-chat):
```html
@if (pendingAttachment()) {
  <div class="flex items-center gap-2 px-4 py-2 bg-primary-container/30 rounded-lg mx-4 mb-1 text-sm">
    <span class="material-symbols-outlined text-sm text-primary">attach_file</span>
    <span class="flex-1 truncate font-medium">{{ pendingAttachment()!.fileName }}</span>
    <span class="text-xs text-on-surface-variant">{{ formatSize(pendingAttachment()!.sizeBytes) }}</span>
    <button class="hover:text-error" type="button" (click)="clearAttachment()">
      <span class="material-symbols-outlined text-sm">close</span>
    </button>
  </div>
}
```

Add `(paste)="onPaste($event)"` to the DM textarea element and `data-testid="dm-message-input"` (already there from Phase 4e).

- [ ] **Step 3: Run full Angular test suite**

```bash
cd frontend && CI=1 npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 4: Run full .NET unit tests**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ -v minimal 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/dialogs/direct-messages/direct-messages.ts \
        frontend/src/app/features/dialogs/direct-messages/direct-messages.html
git commit -m "feat: DM file upload button, clipboard paste, attachment preview, file card"
```

---

## Self-Review

**Spec coverage check (AGENT.md §13):**
- ✅ `image/*` → 3 MB limit, others → 20 MB: Task 2
- ✅ Return 413 on violation: Task 2
- ✅ Upload via button: Tasks 7, 8
- ✅ Clipboard paste (`ClipboardEvent`): Tasks 7, 8
- ✅ `StoragePath` relative under `Storage:BasePath`: Task 1 (LocalFileStorage)
- ✅ Access gate: RoomMembership (active, non-banned) or PersonalDialog participation: Task 3
- ✅ Frozen dialogs: allow download (no extra check in Task 3)
- ✅ `OrphanCleanupService` nightly: Task 4
- ✅ Authenticated download via XHR (not plain `<a href>`): Tasks 6, 7, 8

**Placeholder scan:** No TBD/TODO in code blocks.

**Type consistency:**
- `AttachmentDto` in TS uses `id`, `fileName`, `contentType`, `sizeBytes`, `comment` — matches C# record field names (camelCase from JSON).
- `FilesApiService.downloadFile` called from `room-chat.ts` with `(attachmentId, fileName)` signature matches service definition.
- `msg.attachment.id`, `msg.attachment.contentType`, `msg.attachment.sizeBytes` match `AttachmentDto` in `files.models.ts` (and existing `hub.models.ts` `DialogMessageDto.attachment` shape).
