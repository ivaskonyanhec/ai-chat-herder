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
        => Task.FromResult(Results.StatusCode(StatusCodes.Status501NotImplemented)); // stub — implemented in Task 3
}
