using System.Security.Claims;
using System.Text;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using ChatHerder.API.Endpoints;

namespace ChatHerder.API.Hubs;

[Authorize]
public sealed class ChatHub(AppDbContext db, IUnreadStore unread, IPresenceStore presence) : Hub
{
    private const int MaxMessageBytes = 3072;

    // ── Room messages ──────────────────────────────────────────────────────────

    public async Task SendMessage(Guid roomId, string content,
        Guid? replyToId = null, Guid? attachmentId = null)
    {
        if (string.IsNullOrWhiteSpace(content) || Encoding.UTF8.GetByteCount(content) > MaxMessageBytes)
            throw new HubException("Message content is invalid or exceeds 3 KB.");

        var ct     = Context.ConnectionAborted;
        var userId = GetUserId();

        var isMember = await db.RoomMemberships.AnyAsync(
            m => m.RoomId == roomId && m.UserId == userId, ct);
        if (!isMember) throw new HubException("Not a room member.");

        var isBanned = await db.RoomBans.AnyAsync(
            b => b.RoomId == roomId && b.BannedUserId == userId && b.RevokedAt == null, ct);
        if (isBanned) throw new HubException("You are banned from this room.");

        var seq = await AllocateSequenceAsync(ContextType.Room, roomId, ct);

        var msg = new Message
        {
            RoomId           = roomId,
            AuthorId         = userId,
            Content          = content,
            SequenceNumber   = seq,
            ReplyToMessageId = replyToId,
        };
        db.Messages.Add(msg);
        await db.SaveChangesAsync(ct);

        var full = await db.Messages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstAsync(m => m.Id == msg.Id, ct);

        await Clients.Group($"room:{roomId}").SendAsync("MessageReceived", RoomEndpoints.ToDto(full), ct);
        await BroadcastRoomUnreadAsync(roomId, userId, ct);
    }

    public async Task EditMessage(Guid messageId, string newContent)
    {
        if (string.IsNullOrWhiteSpace(newContent) || Encoding.UTF8.GetByteCount(newContent) > MaxMessageBytes)
            throw new HubException("Message content is invalid or exceeds 3 KB.");

        var ct     = Context.ConnectionAborted;
        var userId = GetUserId();

        var msg = await db.Messages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null, ct);

        if (msg is null) throw new HubException("Message not found.");
        if (msg.AuthorId != userId) throw new HubException("Cannot edit another user's message.");

        msg.Content  = newContent;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await Clients.Group($"room:{msg.RoomId}").SendAsync("MessageEdited", RoomEndpoints.ToDto(msg), ct);
    }

    public async Task DeleteMessage(Guid messageId)
    {
        var ct     = Context.ConnectionAborted;
        var userId = GetUserId();

        var msg = await db.Messages
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null, ct);

        if (msg is null) throw new HubException("Message not found.");

        var isAuthor = msg.AuthorId == userId;
        var isAdmin  = await db.RoomMemberships.AnyAsync(m =>
            m.RoomId == msg.RoomId && m.UserId == userId &&
            (m.Role == MemberRole.Admin || m.Role == MemberRole.Owner), ct);

        if (!isAuthor && !isAdmin) throw new HubException("Insufficient permissions.");

        msg.DeletedAt       = DateTime.UtcNow;
        msg.DeletedByUserId = userId;
        await db.SaveChangesAsync(ct);

        await Clients.Group($"room:{msg.RoomId}").SendAsync(
            "MessageDeleted", new { messageId, roomId = msg.RoomId }, ct);
    }

    // ── Room typing ────────────────────────────────────────────────────────────

    public async Task StartTyping(Guid roomId)
    {
        var userId = GetUserId();
        await Clients.OthersInGroup($"room:{roomId}").SendAsync(
            "UserTyping", new { roomId, userId, isTyping = true }, Context.ConnectionAborted);
    }

    public async Task StopTyping(Guid roomId)
    {
        var userId = GetUserId();
        await Clients.OthersInGroup($"room:{roomId}").SendAsync(
            "UserTyping", new { roomId, userId, isTyping = false }, Context.ConnectionAborted);
    }

    // ── DM messages ───────────────────────────────────────────────────────────

    public async Task SendDirectMessage(Guid dialogId, string content,
        Guid? replyToId = null, Guid? attachmentId = null)
    {
        if (string.IsNullOrWhiteSpace(content) || Encoding.UTF8.GetByteCount(content) > MaxMessageBytes)
            throw new HubException("Message content is invalid or exceeds 3 KB.");

        var ct     = Context.ConnectionAborted;
        var userId = GetUserId();

        var dialog = await db.PersonalDialogs.FirstOrDefaultAsync(
            d => d.Id == dialogId && (d.User1Id == userId || d.User2Id == userId), ct);
        if (dialog is null) throw new HubException("Dialog not found.");
        if (dialog.FrozenAt is not null) throw new HubException("This dialog is frozen.");

        var seq = await AllocateSequenceAsync(ContextType.Dialog, dialogId, ct);

        var dm = new PersonalDialogMessage
        {
            DialogId         = dialogId,
            AuthorId         = userId,
            Content          = content,
            SequenceNumber   = seq,
            ReplyToMessageId = replyToId,
        };
        db.PersonalDialogMessages.Add(dm);
        await db.SaveChangesAsync(ct);

        var full = await db.PersonalDialogMessages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstAsync(m => m.Id == dm.Id, ct);

        await Clients.Group($"dialog:{dialogId}").SendAsync("DirectMessageReceived", ToDialogDto(full), ct);

        var otherId = dialog.User1Id == userId ? dialog.User2Id : dialog.User1Id;
        await unread.IncrementAsync(otherId, "dialog", dialogId, ct);
        var connIds = await presence.GetConnectionIdsAsync(otherId, ct);
        if (connIds.Count > 0)
        {
            var count = await unread.GetCountAsync(otherId, "dialog", dialogId, ct);
            await Clients.Clients(connIds).SendAsync(
                "UnreadCountChanged", new { contextType = "dialog", contextId = dialogId, count }, ct);
        }
    }

    public async Task EditDirectMessage(Guid messageId, string newContent)
    {
        if (string.IsNullOrWhiteSpace(newContent) || Encoding.UTF8.GetByteCount(newContent) > MaxMessageBytes)
            throw new HubException("Message content is invalid or exceeds 3 KB.");

        var ct     = Context.ConnectionAborted;
        var userId = GetUserId();

        var msg = await db.PersonalDialogMessages
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author)
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null, ct);

        if (msg is null) throw new HubException("Message not found.");
        if (msg.AuthorId != userId) throw new HubException("Cannot edit another user's message.");

        msg.Content  = newContent;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await Clients.Group($"dialog:{msg.DialogId}").SendAsync("DirectMessageEdited", ToDialogDto(msg), ct);
    }

    public async Task DeleteDirectMessage(Guid messageId)
    {
        var ct     = Context.ConnectionAborted;
        var userId = GetUserId();

        var msg = await db.PersonalDialogMessages
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null, ct);

        if (msg is null) throw new HubException("Message not found.");
        if (msg.AuthorId != userId) throw new HubException("Cannot delete another user's message.");

        msg.DeletedAt       = DateTime.UtcNow;
        msg.DeletedByUserId = userId;
        await db.SaveChangesAsync(ct);

        await Clients.Group($"dialog:{msg.DialogId}").SendAsync(
            "DirectMessageDeleted", new { messageId, dialogId = msg.DialogId }, ct);
    }

    // ── DM typing ─────────────────────────────────────────────────────────────

    public async Task StartTypingDM(Guid dialogId)
    {
        var userId = GetUserId();
        await Clients.OthersInGroup($"dialog:{dialogId}").SendAsync(
            "UserTypingInDialog", new { dialogId, userId, isTyping = true }, Context.ConnectionAborted);
    }

    public async Task StopTypingDM(Guid dialogId)
    {
        var userId = GetUserId();
        await Clients.OthersInGroup($"dialog:{dialogId}").SendAsync(
            "UserTypingInDialog", new { dialogId, userId, isTyping = false }, Context.ConnectionAborted);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<long> AllocateSequenceAsync(ContextType type, Guid contextId, CancellationToken ct)
    {
        // UPSERT+RETURNING: first insert returns 1; subsequent calls return N+1. Atomic — no MAX()+1.
        var results = await db.Database
            .SqlQuery<long>($"""
                INSERT INTO "ContextSequences" ("ContextType", "ContextId", "NextValue")
                VALUES ({(int)type}, {contextId}, 1)
                ON CONFLICT ("ContextType", "ContextId") DO UPDATE
                    SET "NextValue" = "ContextSequences"."NextValue" + 1
                RETURNING "NextValue"
                """)
            .ToListAsync(ct);
        return results[0];
    }

    private async Task BroadcastRoomUnreadAsync(Guid roomId, Guid senderId, CancellationToken ct)
    {
        var memberIds = await db.RoomMemberships
            .Where(m => m.RoomId == roomId)
            .Select(m => m.UserId)
            .ToListAsync(ct);

        var tasks = memberIds
            .Where(id => id != senderId)
            .Select(async memberId =>
            {
                await unread.IncrementAsync(memberId, "room", roomId, ct);
                var connIds = await presence.GetConnectionIdsAsync(memberId, ct);
                if (connIds.Count > 0)
                {
                    var count = await unread.GetCountAsync(memberId, "room", roomId, ct);
                    await Clients.Clients(connIds).SendAsync(
                        "UnreadCountChanged",
                        new { contextType = "room", contextId = roomId, count }, ct);
                }
            });
        await Task.WhenAll(tasks);
    }

    private static DialogMessageDto ToDialogDto(PersonalDialogMessage m) =>
        new(m.Id, m.SequenceNumber,
            m.DeletedAt.HasValue ? null : m.Content,
            new UserSummary(m.Author.Id, m.Author.Username, m.Author.AvatarUrl),
            m.SentAt, m.EditedAt,
            m.DeletedAt.HasValue,
            m.ReplyToMessage is null ? null : ToDialogDto(m.ReplyToMessage),
            m.Attachment is null ? null
                : new AttachmentDto(m.Attachment.Id, m.Attachment.FileName,
                    m.Attachment.ContentType, m.Attachment.SizeBytes, m.Attachment.Comment));

    private Guid GetUserId()
    {
        var raw = Context.User?.FindFirstValue("user_id");
        if (!Guid.TryParse(raw, out var id)) throw new HubException("Unauthorized");
        return id;
    }
}
