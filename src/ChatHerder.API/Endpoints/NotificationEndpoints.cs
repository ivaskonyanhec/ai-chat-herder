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
        group.MapGet("/unread",                  GetUnread)      .RequireAuthorization();
        group.MapPost("/rooms/{id:guid}/read",   MarkRoomRead)   .RequireAuthorization();
        group.MapPost("/dialogs/{id:guid}/read", MarkDialogRead) .RequireAuthorization();
        return group;
    }

    private static async Task<IResult> GetUnread(
        ClaimsPrincipal principal,
        AppDbContext db,
        IUnreadStore unread,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

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
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

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
                    UserId            = userId,
                    ContextType       = "room",
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

    private static async Task<IResult> MarkDialogRead(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        IUnreadStore unread,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

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
