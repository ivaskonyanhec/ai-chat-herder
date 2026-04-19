using System.Security.Claims;
using ChatHerder.API.Hubs;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class RoomEndpoints
{
    public static RouteGroupBuilder MapRoomEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("", GetPublicCatalog).AllowAnonymous();
        group.MapGet("/my", GetMyRooms).RequireAuthorization();
        group.MapPost("", CreateRoom).RequireAuthorization();
        group.MapGet("/{id:guid}", GetRoom).RequireAuthorization();
        group.MapPatch("/{id:guid}", UpdateRoom).RequireAuthorization();
        group.MapDelete("/{id:guid}", DeleteRoom).RequireAuthorization();
        group.MapPost("/{id:guid}/join", JoinRoom).RequireAuthorization();
        group.MapDelete("/{id:guid}/leave", LeaveRoom).RequireAuthorization();
        group.MapGet("/{id:guid}/members", GetMembers).RequireAuthorization();
        group.MapGet("/{id:guid}/messages", GetMessages).RequireAuthorization();
        group.MapGet("/{id:guid}/bans", GetBans).RequireAuthorization();
        group.MapPost("/{id:guid}/members/{userId:guid}/ban", BanMember).RequireAuthorization();
        group.MapDelete("/{id:guid}/bans/{userId:guid}", UnbanMember).RequireAuthorization();
        group.MapPost("/{id:guid}/members/{userId:guid}/make-admin", MakeAdmin).RequireAuthorization();
        group.MapDelete("/{id:guid}/members/{userId:guid}/admin", RemoveAdmin).RequireAuthorization();
        group.MapDelete("/{id:guid}/messages/{msgId:guid}", DeleteMessage).RequireAuthorization();
        return group;
    }

    internal static Task<IResult> CreateRoomInternal(CreateRoomRequest req, ClaimsPrincipal p, AppDbContext db,
        CancellationToken ct)
        => CreateRoom(req, p, db, ct);

    internal static Task<IResult> JoinRoomInternal(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => JoinRoom(id, p, db, ct);

    internal static Task<IResult> BanMemberInternal(
        Guid id, Guid userId, BanMemberRequest req,
        ClaimsPrincipal principal, AppDbContext db,
        IHubContext<PresenceHub> presenceHub, IPresenceStore presence,
        CancellationToken ct)
        => BanMember(id, userId, req, principal, db, presenceHub, presence, ct);

    private static async Task<IResult> GetPublicCatalog(
        AppDbContext db,
        string? search,
        int page = 1,
        int limit = 20,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 100);
        page = Math.Max(1, page);

        var query = db.Rooms.Where(r => r.Visibility == RoomVisibility.Public && r.DeletedAt == null);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(r => EF.Functions.ILike(r.Name, $"%{search}%"));

        var rooms = await query
            .OrderBy(r => r.Name)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(r => new
            {
                r.Id, r.Name, r.Description, r.OwnerId, r.CreatedAt,
                MemberCount = db.RoomMemberships.Count(m => m.RoomId == r.Id),
            })
            .ToListAsync(ct);

        return Results.Ok(rooms);
    }

    private static async Task<IResult> GetMyRooms(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var rooms = await db.RoomMemberships
            .Where(m => m.UserId == userId)
            .Include(m => m.Room)
            .Where(m => m.Room.DeletedAt == null)
            .Select(m => new RoomDto(
                m.Room.Id,
                m.Room.Name,
                m.Room.Description,
                m.Room.Visibility.ToString(),
                m.Room.OwnerId,
                m.Room.CreatedAt,
                db.RoomMemberships.Count(x => x.RoomId == m.RoomId),
                m.Role.ToString()))
            .ToListAsync(ct);

        return Results.Ok(rooms);
    }

    private static async Task<IResult> CreateRoom(
        CreateRoomRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || req.Name.Length > 64)
            return Results.BadRequest(new { error = "Room name must be 1–64 characters." });

        if (!Enum.TryParse<RoomVisibility>(req.Visibility, ignoreCase: true, out var visibility))
            return Results.BadRequest(new { error = "Visibility must be 'Public' or 'Private'." });

        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        if (await db.Rooms.AnyAsync(r => r.Name == req.Name && r.DeletedAt == null, ct))
            return Results.Conflict(new { error = "Room name is already taken." });

        var room = new Room
        {
            Name = req.Name,
            Description = req.Description,
            Visibility = visibility,
            OwnerId = userId,
        };
        db.Rooms.Add(room);

        db.RoomMemberships.Add(new RoomMembership
        {
            RoomId = room.Id,
            UserId = userId,
            Role = MemberRole.Owner,
        });

        db.ContextSequences.Add(new ContextSequences
        {
            ContextType = ContextType.Room,
            ContextId = room.Id,
            NextValue = 1,
        });

        await db.SaveChangesAsync(ct);

        return Results.Ok(new RoomDto(
            room.Id, room.Name, room.Description,
            room.Visibility.ToString(), room.OwnerId, room.CreatedAt, 1, "Owner"));
    }

    private static async Task<IResult> GetRoom(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == id && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();

        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var membership = await db.RoomMemberships.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
        var count = await db.RoomMemberships.CountAsync(m => m.RoomId == id, ct);

        return Results.Ok(new RoomDto(
            room.Id, room.Name, room.Description,
            room.Visibility.ToString(), room.OwnerId, room.CreatedAt,
            count, membership?.Role.ToString()));
    }

    private static async Task<IResult> UpdateRoom(
        Guid id,
        UpdateRoomRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == id && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();
        if (room.OwnerId != userId) return Results.Forbid();

        if (req.Name is not null)
        {
            if (req.Name.Length > 64) return Results.BadRequest(new { error = "Room name must be ≤ 64 characters." });
            if (await db.Rooms.AnyAsync(r => r.Name == req.Name && r.Id != id && r.DeletedAt == null, ct))
                return Results.Conflict(new { error = "Room name is already taken." });
            room.Name = req.Name;
        }

        if (req.Description is not null) room.Description = req.Description;

        if (req.Visibility is not null)
        {
            if (!Enum.TryParse<RoomVisibility>(req.Visibility, ignoreCase: true, out var v))
                return Results.BadRequest(new { error = "Visibility must be 'Public' or 'Private'." });
            room.Visibility = v;
        }

        await db.SaveChangesAsync(ct);
        var count = await db.RoomMemberships.CountAsync(m => m.RoomId == id, ct);
        return Results.Ok(new RoomDto(room.Id, room.Name, room.Description, room.Visibility.ToString(), room.OwnerId,
            room.CreatedAt, count, "Owner"));
    }

    private static async Task<IResult> DeleteRoom(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        IFileStorage fileStorage,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == id && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();
        if (room.OwnerId != userId) return Results.Forbid();

        // Collect attachment paths before deleting — attachment FK is on Attachment.MessageId (not Message.AttachmentId)
        var roomMessageIds = await db.Messages
            .Where(m => m.RoomId == id)
            .Select(m => m.Id)
            .ToListAsync(ct);

        var attachmentPaths = await db.Attachments
            .Where(a => a.MessageId != null && roomMessageIds.Contains(a.MessageId!.Value))
            .Select(a => a.StoragePath)
            .ToListAsync(ct);

        foreach (var path in attachmentPaths)
            await fileStorage.DeleteAsync(path, ct);

        await db.Messages.Where(m => m.RoomId == id).ExecuteDeleteAsync(ct);
        await db.RoomMemberships.Where(m => m.RoomId == id).ExecuteDeleteAsync(ct);
        await db.RoomBans.Where(b => b.RoomId == id).ExecuteDeleteAsync(ct);
        await db.RoomInvitations.Where(i => i.RoomId == id).ExecuteDeleteAsync(ct);
        await db.ContextSequences.Where(s => s.ContextType == ContextType.Room && s.ContextId == id)
            .ExecuteDeleteAsync(ct);

        room.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    private static async Task<IResult> JoinRoom(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == id && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();
        if (room.Visibility == RoomVisibility.Private) return Results.Forbid();

        var activeBan =
            await db.RoomBans.AnyAsync(b => b.RoomId == id && b.BannedUserId == userId && b.RevokedAt == null, ct);
        if (activeBan) return Results.Problem("You are banned from this room.", statusCode: 403);

        var already = await db.RoomMemberships.AnyAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (already) return Results.Conflict(new { error = "Already a member." });

        db.RoomMemberships.Add(new RoomMembership { RoomId = id, UserId = userId, Role = MemberRole.Member });
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    private static async Task<IResult> LeaveRoom(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var membership = await db.RoomMemberships.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (membership is null) return Results.NotFound();
        if (membership.Role == MemberRole.Owner)
            return Results.BadRequest(new { error = "Owner cannot leave. Delete the room instead." });

        await db.RoomMemberships.Where(m => m.RoomId == id && m.UserId == userId).ExecuteDeleteAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> GetMembers(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        IPresenceStore presence,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var isMember = await db.RoomMemberships.AnyAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (!isMember) return Results.Forbid();

        var members = await db.RoomMemberships
            .Where(m => m.RoomId == id)
            .Include(m => m.User)
            .ToListAsync(ct);

        var dtos = new List<RoomMemberDto>(members.Count);
        foreach (var m in members)
        {
            var status = await presence.GetStatusAsync(m.UserId, ct) ?? "offline";
            dtos.Add(new RoomMemberDto(m.UserId, m.User.Username, m.User.AvatarUrl, m.Role.ToString(), m.JoinedAt,
                status));
        }

        return Results.Ok(dtos);
    }

    private static async Task<IResult> GetMessages(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        Guid? before,
        long? afterSeq,
        int limit = 50,
        CancellationToken ct = default)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var isMember = await db.RoomMemberships.AnyAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (!isMember) return Results.Forbid();

        limit = Math.Clamp(limit, 1, 100);

        IQueryable<Message> query = db.Messages
            .Where(m => m.RoomId == id && m.DeletedAt == null)
            .Include(m => m.Author)
            .Include(m => m.Attachment)
            .Include(m => m.ReplyToMessage).ThenInclude(r => r!.Author);

        if (afterSeq.HasValue)
        {
            query = query
                .Where(m => m.SequenceNumber > afterSeq.Value)
                .OrderBy(m => m.SequenceNumber)
                .Take(limit);
        }
        else if (before.HasValue)
        {
            var cursor = await db.Messages.FirstOrDefaultAsync(m => m.Id == before, ct);
            if (cursor is null) return Results.BadRequest(new { error = "Cursor message not found." });

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
        return Results.Ok(messages.Select(ToDto));
    }

    private static async Task<IResult> BanMember(
        Guid id,
        Guid userId,
        BanMemberRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        IHubContext<PresenceHub> presenceHub,
        IPresenceStore presence,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        if (!await IsAdminOrOwner(db, id, callerId, ct)) return Results.Forbid();

        var targetMembership = await db.RoomMemberships
            .FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (targetMembership is null) return Results.NotFound();
        if (targetMembership.Role == MemberRole.Owner)
            return Results.BadRequest(new { error = "Cannot ban the room owner." });

        db.RoomBans.Add(new RoomBan
        {
            RoomId = id,
            BannedUserId = userId,
            BannedByUserId = callerId,
            Reason = req.Reason,
        });
        await db.SaveChangesAsync(ct);    // Persists ban INSERT first
        await db.RoomMemberships.Where(m => m.RoomId == id && m.UserId == userId).ExecuteDeleteAsync(ct);
        // No second SaveChangesAsync needed — ExecuteDeleteAsync auto-commits

        var connIds = await presence.GetConnectionIdsAsync(userId, ct);
        foreach (var connId in connIds)
            await presenceHub.Clients.Client(connId)
                .SendAsync("RemovedFromRoom", new { roomId = id }, cancellationToken: ct);

        return Results.NoContent();
    }

    private static async Task<IResult> UnbanMember(
        Guid id,
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        if (!await IsAdminOrOwner(db, id, callerId, ct)) return Results.Forbid();

        var ban = await db.RoomBans
            .FirstOrDefaultAsync(b => b.RoomId == id && b.BannedUserId == userId && b.RevokedAt == null, ct);
        if (ban is null) return Results.NotFound();

        ban.RevokedAt = DateTime.UtcNow;
        ban.RevokedByUserId = callerId;
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    private static async Task<IResult> GetBans(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        if (!await IsAdminOrOwner(db, id, callerId, ct)) return Results.Forbid();

        var bans = await db.RoomBans
            .Where(b => b.RoomId == id && b.RevokedAt == null)
            .Include(b => b.BannedUser)
            .Include(b => b.BannedByUser)
            .Select(b => new RoomBanDto(
                b.BannedUserId,
                b.BannedUser.Username,
                b.BannedByUserId,
                b.BannedByUser.Username,
                b.Reason,
                b.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(bans);
    }

    private static async Task<IResult> MakeAdmin(
        Guid id,
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == id && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();
        if (room.OwnerId != callerId) return Results.Forbid();

        var target = await db.RoomMemberships.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (target is null) return Results.NotFound();
        if (target.Role == MemberRole.Owner) return Results.BadRequest(new { error = "Cannot change role of owner." });

        target.Role = MemberRole.Admin;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RemoveAdmin(
        Guid id,
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var callerRole = await db.RoomMemberships
            .Where(m => m.RoomId == id && m.UserId == callerId)
            .Select(m => (MemberRole?)m.Role)
            .FirstOrDefaultAsync(ct);

        if (callerRole is null or MemberRole.Member) return Results.Forbid();
        if (userId == callerId) return Results.BadRequest(new { error = "Cannot demote yourself." });

        var target = await db.RoomMemberships.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId, ct);
        if (target is null) return Results.NotFound();
        if (target.Role == MemberRole.Owner) return Results.BadRequest(new { error = "Cannot demote the owner." });

        target.Role = MemberRole.Member;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteMessage(
        Guid id,
        Guid msgId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        if (!await IsAdminOrOwner(db, id, callerId, ct)) return Results.Forbid();

        var msg = await db.Messages.FirstOrDefaultAsync(m => m.Id == msgId && m.RoomId == id && m.DeletedAt == null,
            ct);
        if (msg is null) return Results.NotFound();

        msg.DeletedAt = DateTime.UtcNow;
        msg.DeletedByUserId = callerId;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<bool> IsAdminOrOwner(AppDbContext db, Guid roomId, Guid userId, CancellationToken ct)
    {
        var role = await db.RoomMemberships
            .Where(m => m.RoomId == roomId && m.UserId == userId)
            .Select(m => (MemberRole?)m.Role)
            .FirstOrDefaultAsync(ct);
        return role is MemberRole.Admin or MemberRole.Owner;
    }

    internal static MessageDto ToDto(Message m) => new(
        m.Id,
        m.SequenceNumber,
        m.DeletedAt == null ? m.Content : null,
        new UserSummary(m.Author.Id, m.Author.Username, m.Author.AvatarUrl),
        m.SentAt,
        m.EditedAt,
        m.DeletedAt != null,
        m.ReplyToMessage is null
            ? null
            : new MessageDto(
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