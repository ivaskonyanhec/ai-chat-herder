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

public static class RoomInvitationEndpoints
{
    public static RouteGroupBuilder MapRoomInvitationEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/rooms/{roomId:guid}/invitations",  GetRoomInvitations).RequireAuthorization();
        group.MapPost("/rooms/{roomId:guid}/invitations", (Guid roomId, InviteUserRequest req, ClaimsPrincipal principal, AppDbContext db, IHubContext<PresenceHub> hub, IPresenceStore presence, CancellationToken ct) => SendInvitation(roomId, req, principal, db, hub, presence, ct)).RequireAuthorization();
        group.MapGet("/invitations",                      GetMyInvitations)  .RequireAuthorization();
        group.MapPost("/invitations/{id:guid}/accept",    AcceptInvitation)  .RequireAuthorization();
        group.MapPost("/invitations/{id:guid}/reject",    RejectInvitation)  .RequireAuthorization();
        return group;
    }

    private static async Task<IResult> GetRoomInvitations(
        Guid roomId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var callerRole = await db.RoomMemberships
            .Where(m => m.RoomId == roomId && m.UserId == callerId)
            .Select(m => (MemberRole?)m.Role)
            .FirstOrDefaultAsync(ct);

        if (callerRole is null or MemberRole.Member) return Results.Forbid();

        var invitations = await db.RoomInvitations
            .Where(i => i.RoomId == roomId && i.Status == InvitationStatus.Pending)
            .Include(i => i.Room)
            .Include(i => i.InvitedByUser)
            .Include(i => i.InvitedUser)
            .Select(i => new RoomInvitationDto(
                i.Id, i.RoomId, i.Room.Name,
                i.InvitedByUserId, i.InvitedByUser.Username,
                i.InvitedUserId, i.InvitedUser.Username,
                i.Status.ToString(), i.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(invitations);
    }

    private static async Task<IResult> SendInvitation(
        Guid roomId,
        InviteUserRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        IHubContext<PresenceHub> presenceHub,
        IPresenceStore presence,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var callerRole = await db.RoomMemberships
            .Where(m => m.RoomId == roomId && m.UserId == callerId)
            .Select(m => (MemberRole?)m.Role)
            .FirstOrDefaultAsync(ct);

        if (callerRole is null or MemberRole.Member) return Results.Forbid();

        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId && r.DeletedAt == null, ct);
        if (room is null) return Results.NotFound();

        var invitee = await db.Users.FirstOrDefaultAsync(u => u.Username == req.Username && u.DeletedAt == null, ct);
        if (invitee is null) return Results.NotFound(new { error = "User not found." });

        if (await db.RoomMemberships.AnyAsync(m => m.RoomId == roomId && m.UserId == invitee.Id, ct))
            return Results.Conflict(new { error = "User is already a member." });

        if (await db.RoomBans.AnyAsync(b => b.RoomId == roomId && b.BannedUserId == invitee.Id && b.RevokedAt == null, ct))
            return Results.Problem("User is banned from this room.", statusCode: 403);

        var invitation = new RoomInvitation
        {
            RoomId          = roomId,
            InvitedByUserId = callerId,
            InvitedUserId   = invitee.Id,
            Status          = InvitationStatus.Pending,
        };
        db.RoomInvitations.Add(invitation);
        await db.SaveChangesAsync(ct);

        var connIds = await presence.GetConnectionIdsAsync(invitee.Id, ct);
        foreach (var connId in connIds)
            await presenceHub.Clients.Client(connId)
                .SendAsync("RoomInvitationReceived",
                    new { invitationId = invitation.Id, roomId, roomName = room.Name, fromUserId = callerId },
                    cancellationToken: ct);

        return Results.NoContent();
    }

    internal static Task<IResult> SendInvitationInternal(
        Guid roomId, InviteUserRequest req, ClaimsPrincipal principal, AppDbContext db,
        IHubContext<PresenceHub> presenceHub, IPresenceStore presence, CancellationToken ct)
        => SendInvitation(roomId, req, principal, db, presenceHub, presence, ct);

    private static async Task<IResult> GetMyInvitations(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var invitations = await db.RoomInvitations
            .Where(i => i.InvitedUserId == userId && i.Status == InvitationStatus.Pending)
            .Include(i => i.Room)
            .Include(i => i.InvitedByUser)
            .Include(i => i.InvitedUser)
            .Select(i => new RoomInvitationDto(
                i.Id, i.RoomId, i.Room.Name,
                i.InvitedByUserId, i.InvitedByUser.Username,
                i.InvitedUserId, i.InvitedUser.Username,
                i.Status.ToString(), i.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(invitations);
    }

    private static async Task<IResult> AcceptInvitation(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var invitation = await db.RoomInvitations
            .FirstOrDefaultAsync(i => i.Id == id && i.InvitedUserId == userId && i.Status == InvitationStatus.Pending, ct);
        if (invitation is null) return Results.NotFound();

        invitation.Status      = InvitationStatus.Accepted;
        invitation.RespondedAt = DateTime.UtcNow;

        db.RoomMemberships.Add(new RoomMembership
        {
            RoomId = invitation.RoomId,
            UserId = userId,
            Role   = MemberRole.Member,
        });

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RejectInvitation(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var invitation = await db.RoomInvitations
            .FirstOrDefaultAsync(i => i.Id == id && i.InvitedUserId == userId && i.Status == InvitationStatus.Pending, ct);
        if (invitation is null) return Results.NotFound();

        invitation.Status      = InvitationStatus.Rejected;
        invitation.RespondedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}
