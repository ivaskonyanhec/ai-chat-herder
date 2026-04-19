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
        group.MapGet("",                        GetDialogs)  .RequireAuthorization();
        group.MapPost("",                       CreateDialog).RequireAuthorization();
        group.MapGet("/{id:guid}",              GetDialog)   .RequireAuthorization();
        group.MapGet("/{id:guid}/messages",     GetMessages) .RequireAuthorization();
        return group;
    }

    public static RouteGroupBuilder MapDmMessageEndpoints(this RouteGroupBuilder group)
    {
        group.MapPatch("/{id:guid}",  EditDmMessage)  .RequireAuthorization();
        group.MapDelete("/{id:guid}", DeleteDmMessage).RequireAuthorization();
        return group;
    }

    // ── Internal wrappers for unit tests ──────────────────────────────────────

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

    // ── Handlers ──────────────────────────────────────────────────────────────

    private static async Task<IResult> GetDialogs(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var dialogs = await db.PersonalDialogs
            .Where(d => d.User1Id == callerId || d.User2Id == callerId)
            .Include(d => d.User1)
            .Include(d => d.User2)
            .ToListAsync(ct);

        return Results.Ok(dialogs.Select(d => ToDialogDto(d, callerId)));
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

        var otherUser = await db.Users.FirstOrDefaultAsync(u => u.Id == req.UserId && u.DeletedAt == null, ct);
        if (otherUser is null)
            return Results.NotFound(new { error = "User not found." });

        var areFriends = await db.Friendships.AnyAsync(
            f => (f.User1Id == callerId && f.User2Id == req.UserId) ||
                 (f.User1Id == req.UserId && f.User2Id == callerId), ct);
        if (!areFriends)
            return Results.StatusCode(403);

        var (u1, u2) = callerId < req.UserId ? (callerId, req.UserId) : (req.UserId, callerId);

        var existing = await db.PersonalDialogs
            .Include(d => d.User1)
            .Include(d => d.User2)
            .FirstOrDefaultAsync(d => d.User1Id == u1 && d.User2Id == u2, ct);

        if (existing is not null)
            return Results.Ok(ToDialogDto(existing, callerId));

        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        await db.SaveChangesAsync(ct);

        // Reload with navigation properties
        var created = await db.PersonalDialogs
            .Include(d => d.User1)
            .Include(d => d.User2)
            .FirstAsync(d => d.Id == dialog.Id, ct);

        return Results.Ok(ToDialogDto(created, callerId));
    }

    private static async Task<IResult> GetDialog(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var dialog = await db.PersonalDialogs
            .Include(d => d.User1)
            .Include(d => d.User2)
            .FirstOrDefaultAsync(d => d.Id == id, ct);

        if (dialog is null)
            return Results.NotFound();

        if (dialog.User1Id != callerId && dialog.User2Id != callerId)
            return Results.StatusCode(403);

        return Results.Ok(ToDialogDto(dialog, callerId));
    }

    private static async Task<IResult> GetMessages(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        Guid? before,
        int limit,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var dialog = await db.PersonalDialogs.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (dialog is null)
            return Results.NotFound();

        if (dialog.User1Id != callerId && dialog.User2Id != callerId)
            return Results.StatusCode(403);

        limit = Math.Clamp(limit, 1, 100);

        IQueryable<PersonalDialogMessage> query = db.PersonalDialogMessages
            .Where(m => m.DialogId == id)
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author);

        if (before.HasValue)
        {
            var cursor = await db.PersonalDialogMessages.FirstOrDefaultAsync(m => m.Id == before, ct);
            if (cursor is null)
                return Results.BadRequest(new { error = "Cursor message not found." });

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
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(req.Content))
            return Results.BadRequest(new { error = "Content cannot be empty." });

        if (Encoding.UTF8.GetByteCount(req.Content) > MaxMessageBytes)
            return Results.BadRequest(new { error = $"Content exceeds {MaxMessageBytes} bytes." });

        var msg = await db.PersonalDialogMessages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstOrDefaultAsync(m => m.Id == id, ct);

        if (msg is null)
            return Results.NotFound();

        if (msg.AuthorId != callerId)
            return Results.StatusCode(403);

        msg.Content = req.Content;
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
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var msg = await db.PersonalDialogMessages.FirstOrDefaultAsync(m => m.Id == id, ct);
        if (msg is null)
            return Results.NotFound();

        if (msg.AuthorId != callerId)
            return Results.StatusCode(403);

        msg.DeletedAt = DateTime.UtcNow;
        msg.DeletedByUserId = callerId;
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static DialogDto ToDialogDto(PersonalDialog d, Guid callerId)
    {
        var otherId       = d.User1Id == callerId ? d.User2Id        : d.User1Id;
        var otherUsername = d.User1Id == callerId ? d.User2.Username  : d.User1.Username;
        var otherAvatar   = d.User1Id == callerId ? d.User2.AvatarUrl : d.User1.AvatarUrl;
        return new DialogDto(d.Id, otherId, otherUsername, otherAvatar, d.CreatedAt, d.FrozenAt.HasValue);
    }

    private static DialogMessageDto ToMessageDto(PersonalDialogMessage m) => new(
        m.Id,
        m.SequenceNumber,
        m.DeletedAt == null ? m.Content : null,
        new UserSummary(m.Author.Id, m.Author.Username, m.Author.AvatarUrl),
        m.SentAt,
        m.EditedAt,
        m.DeletedAt != null,
        m.ReplyToMessage is null
            ? null
            : new DialogMessageDto(
                m.ReplyToMessage.Id,
                m.ReplyToMessage.SequenceNumber,
                m.ReplyToMessage.DeletedAt == null ? m.ReplyToMessage.Content : null,
                new UserSummary(m.ReplyToMessage.Author.Id, m.ReplyToMessage.Author.Username,
                    m.ReplyToMessage.Author.AvatarUrl),
                m.ReplyToMessage.SentAt, m.ReplyToMessage.EditedAt, m.ReplyToMessage.DeletedAt != null, null, null),
        m.Attachment is null
            ? null
            : new AttachmentDto(
                m.Attachment.Id,
                m.Attachment.FileName,
                m.Attachment.ContentType,
                m.Attachment.SizeBytes,
                m.Attachment.Comment));
}
