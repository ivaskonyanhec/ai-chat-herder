using ChatHerder.API.Hubs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Hubs;

public sealed class PresenceHubTests
{
    private static AppDbContext BuildDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static (PresenceHub hub, IPresenceStore store, IHubCallerClients clients, IGroupManager groups)
        BuildHub(Guid userId, AppDbContext? db = null)
    {
        var store   = Substitute.For<IPresenceStore>();
        var chatCtx = Substitute.For<IHubContext<ChatHub>>();
        chatCtx.Groups.Returns(Substitute.For<IGroupManager>());

        var hub = new PresenceHub(store, chatCtx, db ?? BuildDb());

        var context = Substitute.For<HubCallerContext>();
        context.ConnectionId.Returns("conn-1");
        context.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id",    userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test")));
        context.Items.Returns(new Dictionary<object, object?>());
        context.Features.Returns(Substitute.For<IFeatureCollection>());
        hub.Context = context;

        var clients = Substitute.For<IHubCallerClients>();
        var allProxy = Substitute.For<IClientProxy>();
        clients.All.Returns(allProxy);
        hub.Clients = clients;

        var groups = Substitute.For<IGroupManager>();
        hub.Groups = groups;

        return (hub, store, clients, groups);
    }

    [Fact]
    public async Task OnConnectedAsync_RegistersTabAndSetsOnline()
    {
        var userId = Guid.NewGuid();
        var (hub, store, _, _) = BuildHub(userId);
        store.GetStatusAsync(userId).Returns((string?)"offline");

        await hub.OnConnectedAsync();

        await store.Received(1).RegisterTabAsync(userId, "conn-1");
        await store.Received(1).AddToActiveUsersAsync(userId);
        await store.Received(1).SetStatusAsync(userId, "online");
    }

    [Fact]
    public async Task Heartbeat_RefreshesScoreAndClearsAfk()
    {
        var userId = Guid.NewGuid();
        var (hub, store, _, _) = BuildHub(userId);
        store.GetStatusAsync(userId).Returns((string?)"online");
        store.IsAllTabsAfkAsync(userId).Returns(false);

        await hub.Heartbeat();

        await store.Received(1).RegisterTabAsync(userId, "conn-1");
        await store.Received(1).ClearAfkTabAsync(userId, "conn-1");
    }

    [Fact]
    public async Task SetAfk_WhenAllTabsAfk_BroadcastsAfkStatus()
    {
        var userId = Guid.NewGuid();
        var (hub, store, clients, _) = BuildHub(userId);
        store.IsAllTabsAfkAsync(userId).Returns(true);

        await hub.SetAfk();

        await store.Received(1).SetAfkTabAsync(userId, "conn-1");
        await store.Received(1).SetStatusAsync(userId, "afk");
        // SendAsync is an extension over SendCoreAsync; verify via the underlying method
        await clients.All.Received(1).SendCoreAsync(
            "UserStatusChanged", Arg.Any<object[]>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task JoinRoom_SendsRoomMembersSnapshot_ToCallerOnly()
    {
        var userId = Guid.NewGuid();
        var db     = BuildDb();

        db.Users.Add(new User { Id = userId, Username = "alice", Email = "a@x.com", PasswordHash = "x" });
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = userId };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership
            { RoomId = room.Id, UserId = userId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var (hub, store, clients, _) = BuildHub(userId, db);
        store.GetStatusAsync(userId).Returns((string?)"online");

        // ISingleClientProxy (which IHubCallerClients.Caller returns) inherits IClientProxy
        var callerProxy = Substitute.For<ISingleClientProxy>();
        clients.Caller.Returns(callerProxy);
        var othersProxy = Substitute.For<IClientProxy>();
        clients.OthersInGroup(Arg.Any<string>()).Returns(othersProxy);

        await hub.JoinRoom(room.Id);

        // SendAsync is an extension over SendCoreAsync; verify via the underlying method
        await callerProxy.Received(1).SendCoreAsync(
            "RoomMembersSnapshot", Arg.Any<object[]>(), Arg.Any<CancellationToken>());
    }
}
