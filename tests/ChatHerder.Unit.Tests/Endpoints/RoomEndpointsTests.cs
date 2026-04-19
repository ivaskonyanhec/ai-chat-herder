using ChatHerder.API.Hubs;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class RoomEndpointsTests
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

    [Fact]
    public async Task CreateRoom_ReturnsOk_WithValidRequest()
    {
        await using var db = BuildContext();
        var owner = new User { Username = "owner", Email = "o@test.com", PasswordHash = "x" };
        db.Users.Add(owner);
        await db.SaveChangesAsync();

        var req = new CreateRoomRequest("general", "A room", "Public");
        var principal = MakePrincipal(owner.Id);
        var result = await RoomEndpointsHelper.CreateRoom(req, principal, db, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(1, await db.Rooms.CountAsync());
        Assert.Equal(1, await db.RoomMemberships.CountAsync());
    }

    [Fact]
    public async Task JoinRoom_Returns409_WhenAlreadyMember()
    {
        await using var db = BuildContext();
        var user = new User { Username = "u1", Email = "u1@test.com", PasswordHash = "x" };
        var owner = new User { Username = "owner", Email = "o@test.com", PasswordHash = "x" };
        db.Users.AddRange(user, owner);
        var room = new Room { Name = "general", Visibility = RoomVisibility.Public, OwnerId = owner.Id };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = user.Id, Role = MemberRole.Member });
        await db.SaveChangesAsync();

        var result = await RoomEndpointsHelper.JoinRoom(room.Id, MakePrincipal(user.Id), db, CancellationToken.None);

        Assert.Equal(409, GetStatusCode(result));
    }

    private static AppDbContext BuildSqliteContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source=file:banmember-{Guid.NewGuid():N}?mode=memory&cache=shared")
            .Options;
        var db = new AppDbContext(opts);
        db.Database.EnsureCreated();
        return db;
    }

    [Fact]
    public async Task BanMember_SendsRemovedFromRoom_ToActiveBannedUserConnections()
    {
        await using var db = BuildSqliteContext();

        var ownerId  = Guid.NewGuid();
        var targetId = Guid.NewGuid();
        db.Users.AddRange(
            new User { Id = ownerId,  Username = "owner",  Email = "o@x.com", PasswordHash = "x" },
            new User { Id = targetId, Username = "target", Email = "t@x.com", PasswordHash = "x" });
        var room = new Room { OwnerId = ownerId, Name = "r", Visibility = RoomVisibility.Public };
        db.Rooms.Add(room);
        db.RoomMemberships.AddRange(
            new RoomMembership { RoomId = room.Id, UserId = ownerId,  Role = MemberRole.Owner  },
            new RoomMembership { RoomId = room.Id, UserId = targetId, Role = MemberRole.Member });
        await db.SaveChangesAsync();

        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(targetId).Returns(new[] { "conn-banned" });

        var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
        var hubClients  = Substitute.For<IHubClients>();
        presenceHub.Clients.Returns(hubClients);
        var clientProxy = Substitute.For<ISingleClientProxy>();
        hubClients.Client(Arg.Any<string>()).Returns(clientProxy);

        var result = await RoomEndpointsHelper.BanMember(
            room.Id, targetId,
            new BanMemberRequest("test ban"),
            MakePrincipal(ownerId),
            db, presenceHub, presence,
            CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.RoomBans.CountAsync());
        Assert.Equal(0, await db.RoomMemberships.CountAsync(m => m.UserId == targetId));
        hubClients.Received(1).Client("conn-banned");
        await clientProxy.Received(1).SendCoreAsync(
            "RemovedFromRoom", Arg.Any<object[]>(), Arg.Any<CancellationToken>());
    }

    private static int GetStatusCode(IResult r)
    {
        var prop = r.GetType().GetProperty("StatusCode");
        return (int)(prop?.GetValue(r) ?? 0);
    }
}

internal static class RoomEndpointsHelper
{
    public static Task<IResult> CreateRoom(CreateRoomRequest req, System.Security.Claims.ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.RoomEndpoints.CreateRoomInternal(req, p, db, ct);
    public static Task<IResult> JoinRoom(Guid id, System.Security.Claims.ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.RoomEndpoints.JoinRoomInternal(id, p, db, ct);
    public static Task<IResult> BanMember(
        Guid id, Guid userId, BanMemberRequest req,
        System.Security.Claims.ClaimsPrincipal principal, AppDbContext db,
        IHubContext<PresenceHub> presenceHub, IPresenceStore presence,
        CancellationToken ct)
        => ChatHerder.API.Endpoints.RoomEndpoints.BanMemberInternal(
            id, userId, req, principal, db, presenceHub, presence, ct);
}
