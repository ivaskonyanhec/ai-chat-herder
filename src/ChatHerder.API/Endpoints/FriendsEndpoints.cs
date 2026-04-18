using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class FriendsEndpoints
{
    public static RouteGroupBuilder MapFriendsEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("",                              GetFriends)    .RequireAuthorization();
        group.MapGet("/requests",                    GetRequests)   .RequireAuthorization();
        group.MapPost("/requests",                   SendRequest)   .RequireAuthorization();
        group.MapPost("/requests/{id:guid}/accept",  AcceptRequest) .RequireAuthorization();
        group.MapPost("/requests/{id:guid}/reject",  RejectRequest) .RequireAuthorization();
        group.MapDelete("/{userId:guid}",            RemoveFriend)  .RequireAuthorization();
        return group;
    }

    internal static Task<IResult> GetFriendsInternal(ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => GetFriends(p, db, ct);
    internal static Task<IResult> SendRequestInternal(SendFriendRequestRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => SendRequest(req, p, db, ct);
    internal static Task<IResult> AcceptRequestInternal(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => AcceptRequest(id, p, db, ct);
    internal static Task<IResult> RejectRequestInternal(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => RejectRequest(id, p, db, ct);
    internal static Task<IResult> RemoveFriendInternal(Guid userId, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => RemoveFriend(userId, p, db, ct);

    private static async Task<IResult> GetFriends(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var friendships = await db.Friendships
            .Where(f => f.User1Id == userId || f.User2Id == userId)
            .Include(f => f.User1)
            .Include(f => f.User2)
            .ToListAsync(ct);

        var dtos = friendships.Select(f =>
        {
            var otherId       = f.User1Id == userId ? f.User2Id       : f.User1Id;
            var otherUsername = f.User1Id == userId ? f.User2.Username : f.User1.Username;
            var otherAvatar   = f.User1Id == userId ? f.User2.AvatarUrl : f.User1.AvatarUrl;
            return new FriendDto(f.Id, otherId, otherUsername, otherAvatar, f.CreatedAt);
        });

        return Results.Ok(dtos);
    }

    private static async Task<IResult> GetRequests(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var requests = await db.FriendRequests
            .Where(r => (r.SenderId == userId || r.ReceiverId == userId)
                        && r.Status == FriendRequestStatus.Pending)
            .Include(r => r.Sender)
            .Include(r => r.Receiver)
            .Select(r => new FriendRequestDto(
                r.Id,
                r.SenderId, r.Sender.Username, r.Sender.AvatarUrl,
                r.ReceiverId, r.Receiver.Username, r.Receiver.AvatarUrl,
                r.Status.ToString(), r.Message, r.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(requests);
    }

    private static async Task<IResult> SendRequest(
        SendFriendRequestRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var senderId))
            return Results.Unauthorized();

        var receiver = await db.Users
            .FirstOrDefaultAsync(u => u.Username == req.Username && u.DeletedAt == null, ct);
        if (receiver is null) return Results.NotFound(new { error = "User not found." });
        if (receiver.Id == senderId)
            return Results.BadRequest(new { error = "Cannot send a friend request to yourself." });

        var (u1, u2) = senderId < receiver.Id ? (senderId, receiver.Id) : (receiver.Id, senderId);
        if (await db.Friendships.AnyAsync(f => f.User1Id == u1 && f.User2Id == u2, ct))
            return Results.Conflict(new { error = "You are already friends." });

        if (await db.FriendRequests.AnyAsync(r =>
                r.SenderId == senderId && r.ReceiverId == receiver.Id
                && r.Status == FriendRequestStatus.Pending, ct))
            return Results.Conflict(new { error = "A friend request is already pending." });

        if (await db.UserBlocks.AnyAsync(b =>
                (b.BlockerId == senderId && b.BlockedUserId == receiver.Id) ||
                (b.BlockerId == receiver.Id && b.BlockedUserId == senderId), ct))
            return Results.Problem("Cannot send friend request due to a block.", statusCode: 403);

        db.FriendRequests.Add(new FriendRequest
        {
            SenderId   = senderId,
            ReceiverId = receiver.Id,
            Message    = req.Message,
            Status     = FriendRequestStatus.Pending,
        });
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> AcceptRequest(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var request = await db.FriendRequests
            .FirstOrDefaultAsync(r => r.Id == id && r.ReceiverId == userId
                                       && r.Status == FriendRequestStatus.Pending, ct);
        if (request is null) return Results.NotFound();

        request.Status      = FriendRequestStatus.Accepted;
        request.RespondedAt = DateTime.UtcNow;

        var (u1, u2) = request.SenderId < userId
            ? (request.SenderId, userId)
            : (userId, request.SenderId);
        db.Friendships.Add(new Friendship { User1Id = u1, User2Id = u2 });

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RejectRequest(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var request = await db.FriendRequests
            .FirstOrDefaultAsync(r => r.Id == id && r.ReceiverId == userId
                                       && r.Status == FriendRequestStatus.Pending, ct);
        if (request is null) return Results.NotFound();

        request.Status      = FriendRequestStatus.Rejected;
        request.RespondedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RemoveFriend(
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var (u1, u2) = callerId < userId ? (callerId, userId) : (userId, callerId);
        var friendship = await db.Friendships
            .FirstOrDefaultAsync(f => f.User1Id == u1 && f.User2Id == u2, ct);
        if (friendship is null) return Results.NotFound();

        db.Friendships.Remove(friendship);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
