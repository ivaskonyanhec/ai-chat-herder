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
