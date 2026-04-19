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

public sealed class RoomInvitationEndpointsTests
{
    private static AppDbContext BuildSqliteContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source=file:invitations-{Guid.NewGuid():N}?mode=memory&cache=shared")
            .Options;
        var db = new AppDbContext(opts);
        db.Database.EnsureCreated();
        return db;
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
    public async Task SendInvitation_PushesRoomInvitationReceived_ToInviteeConnections()
    {
        await using var db = BuildSqliteContext();

        var ownerId   = Guid.NewGuid();
        var inviteeId = Guid.NewGuid();
        db.Users.AddRange(
            new User { Id = ownerId,   Username = "owner",   Email = "o@x.com", PasswordHash = "x" },
            new User { Id = inviteeId, Username = "invitee", Email = "i@x.com", PasswordHash = "x" });
        var room = new Room { OwnerId = ownerId, Name = "secret", Visibility = RoomVisibility.Private };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = ownerId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(inviteeId, Arg.Any<CancellationToken>())
                .Returns(new[] { "conn-invitee" });

        var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
        var hubClients  = Substitute.For<IHubClients>();
        presenceHub.Clients.Returns(hubClients);
        var clientProxy = Substitute.For<ISingleClientProxy>();
        hubClients.Client(Arg.Any<string>()).Returns(clientProxy);

        var result = await RoomInvitationEndpointsHelper.SendInvitation(
            room.Id, new InviteUserRequest("invitee"),
            MakePrincipal(ownerId), db, presenceHub, presence,
            CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.RoomInvitations.CountAsync());
        hubClients.Received(1).Client("conn-invitee");
        await clientProxy.Received(1).SendCoreAsync(
            "RoomInvitationReceived", Arg.Any<object[]>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SendInvitation_DoesNotPushSignalR_WhenInviteeHasNoConnections()
    {
        await using var db = BuildSqliteContext();

        var ownerId   = Guid.NewGuid();
        var inviteeId = Guid.NewGuid();
        db.Users.AddRange(
            new User { Id = ownerId,   Username = "owner2",   Email = "o2@x.com", PasswordHash = "x" },
            new User { Id = inviteeId, Username = "invitee2", Email = "i2@x.com", PasswordHash = "x" });
        var room = new Room { OwnerId = ownerId, Name = "secret2", Visibility = RoomVisibility.Private };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = ownerId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(inviteeId, Arg.Any<CancellationToken>())
                .Returns(Array.Empty<string>());

        var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
        var hubClients  = Substitute.For<IHubClients>();
        presenceHub.Clients.Returns(hubClients);
        var clientProxy = Substitute.For<ISingleClientProxy>();
        hubClients.Client(Arg.Any<string>()).Returns(clientProxy);

        var result = await RoomInvitationEndpointsHelper.SendInvitation(
            room.Id, new InviteUserRequest("invitee2"),
            MakePrincipal(ownerId), db, presenceHub, presence,
            CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.RoomInvitations.CountAsync());
        hubClients.DidNotReceive().Client(Arg.Any<string>());
        await clientProxy.DidNotReceive().SendCoreAsync(
            Arg.Any<string>(), Arg.Any<object[]>(), Arg.Any<CancellationToken>());
    }
}

internal static class RoomInvitationEndpointsHelper
{
    public static Task<IResult> SendInvitation(
        Guid roomId, InviteUserRequest req,
        ClaimsPrincipal principal, AppDbContext db,
        IHubContext<PresenceHub> presenceHub, IPresenceStore presence,
        CancellationToken ct)
        => ChatHerder.API.Endpoints.RoomInvitationEndpoints.SendInvitationInternal(
            roomId, req, principal, db, presenceHub, presence, ct);
}
