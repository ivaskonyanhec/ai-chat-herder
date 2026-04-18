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
        group.MapPatch("/{id:guid}",  EditMessage)   .RequireAuthorization();
        group.MapDelete("/{id:guid}", DeleteMessage) .RequireAuthorization();
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

        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var msg = await db.Messages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstOrDefaultAsync(m => m.Id == id && m.DeletedAt == null, ct);

        if (msg is null) return Results.NotFound();
        if (msg.AuthorId != userId) return Results.StatusCode(StatusCodes.Status403Forbidden);

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
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var msg = await db.Messages
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
