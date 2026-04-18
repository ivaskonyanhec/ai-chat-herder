using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class FriendsEndpointsTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(opts);
    }

    private static ClaimsPrincipal MakePrincipal(Guid userId) =>
        new(new ClaimsIdentity([
            new Claim("user_id", userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test"));

    private static int GetStatusCode(IResult r)
    {
        var prop = r.GetType().GetProperty("StatusCode");
        return (int)(prop?.GetValue(r) ?? 0);
    }

    [Fact]
    public async Task GetFriends_ReturnsOk_WithFriendInList()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        db.Friendships.Add(new Friendship { User1Id = u1, User2Id = u2 });
        await db.SaveChangesAsync();

        var result = await FriendsEndpointsHelper.GetFriends(MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
    }

    [Fact]
    public async Task SendRequest_ReturnsNoContent_WhenValid()
    {
        await using var db = BuildContext();
        var sender   = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var receiver = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(sender, receiver);
        await db.SaveChangesAsync();

        var req    = new SendFriendRequestRequest("bob", null);
        var result = await FriendsEndpointsHelper.SendRequest(req, MakePrincipal(sender.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.FriendRequests.CountAsync());
    }

    [Fact]
    public async Task AcceptRequest_ReturnsNoContent_AndCreatesFriendship()
    {
        await using var db = BuildContext();
        var sender   = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var receiver = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(sender, receiver);
        var request = new FriendRequest
        {
            SenderId   = sender.Id,
            ReceiverId = receiver.Id,
            Status     = FriendRequestStatus.Pending,
        };
        db.FriendRequests.Add(request);
        await db.SaveChangesAsync();

        var result = await FriendsEndpointsHelper.AcceptRequest(request.Id, MakePrincipal(receiver.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.Friendships.CountAsync());
        // invariant: User1Id < User2Id
        var friendship = await db.Friendships.SingleAsync();
        Assert.True(friendship.User1Id < friendship.User2Id);
    }

    [Fact]
    public async Task RejectRequest_ReturnsNoContent_AndSetsStatus()
    {
        await using var db = BuildContext();
        var sender   = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var receiver = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(sender, receiver);
        var request = new FriendRequest
        {
            SenderId   = sender.Id,
            ReceiverId = receiver.Id,
            Status     = FriendRequestStatus.Pending,
        };
        db.FriendRequests.Add(request);
        await db.SaveChangesAsync();

        var result = await FriendsEndpointsHelper.RejectRequest(request.Id, MakePrincipal(receiver.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        var updated = await db.FriendRequests.FindAsync(request.Id);
        Assert.Equal(FriendRequestStatus.Rejected, updated!.Status);
    }

    [Fact]
    public async Task RemoveFriend_ReturnsNoContent_AndDeletesFriendship()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        db.Friendships.Add(new Friendship { User1Id = u1, User2Id = u2 });
        await db.SaveChangesAsync();

        var result = await FriendsEndpointsHelper.RemoveFriend(user2.Id, MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(0, await db.Friendships.CountAsync());
    }
}

internal static class FriendsEndpointsHelper
{
    public static Task<IResult> GetFriends(ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.FriendsEndpoints.GetFriendsInternal(p, db, ct);

    public static Task<IResult> SendRequest(SendFriendRequestRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.FriendsEndpoints.SendRequestInternal(req, p, db, ct);

    public static Task<IResult> AcceptRequest(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.FriendsEndpoints.AcceptRequestInternal(id, p, db, ct);

    public static Task<IResult> RejectRequest(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.FriendsEndpoints.RejectRequestInternal(id, p, db, ct);

    public static Task<IResult> RemoveFriend(Guid userId, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.FriendsEndpoints.RemoveFriendInternal(userId, p, db, ct);
}
