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

    private static readonly HashSet<string> BlockedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "text/html",
        "text/javascript",
        "application/javascript",
        "application/x-javascript",
        "application/x-php",
        "text/x-php",
        "application/x-httpd-php",
        "image/svg+xml",
        "application/xml",
        "text/xml",
    };

    private static readonly (byte[] Magic, int? Offset)[] ImageSignatures =
    [
        ([0xFF, 0xD8, 0xFF], null),                                         // JPEG
        ([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], null),         // PNG
        ([0x47, 0x49, 0x46, 0x38], null),                                   // GIF87a/GIF89a
        ([0x42, 0x4D], null),                                               // BMP
        ([0x00, 0x00, 0x01, 0x00], null),                                   // ICO
        ([0x52, 0x49, 0x46, 0x46], null),                                   // WebP (RIFF header)
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

        if (BlockedMimeTypes.Contains(file.ContentType))
            return Results.BadRequest(new { error = $"File type '{file.ContentType}' is not permitted." });

        var isImage = file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
        var limit   = isImage ? MaxImageBytes : MaxFileBytes;
        if (file.Length > limit)
            return Results.StatusCode(StatusCodes.Status413RequestEntityTooLarge);

        await using var stream = file.OpenReadStream();

        if (isImage)
        {
            var header = new byte[16];
            var read   = await stream.ReadAsync(header.AsMemory(0, header.Length), ct);
            if (!IsKnownImageSignature(header.AsSpan(0, read)))
                return Results.BadRequest(new { error = "File content does not match the declared image type." });
            if (stream.CanSeek) stream.Position = 0;
        }

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
            if (attachment.UploadedByUserId != callerId)
                return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        var stream = await storage.OpenReadAsync(attachment.StoragePath, ct);
        return Results.Stream(stream, attachment.ContentType, attachment.FileName);
    }
}
