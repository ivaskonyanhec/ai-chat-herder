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

    [Fact]
    public void PresenceHub_CanBeInstantiated_WithMockedDependencies()
    {
        var store   = Substitute.For<IPresenceStore>();
        var chatCtx = Substitute.For<IHubContext<ChatHub>>();
        chatCtx.Groups.Returns(Substitute.For<IGroupManager>());
        var hub = new PresenceHub(store, chatCtx, BuildDb());
        Assert.NotNull(hub);
    }

    [Fact]
    public async Task JoinDialog_AddsConnectionToChatHubDialogGroup_ForParticipant()
    {
        var userId  = Guid.NewGuid();
        var otherId = Guid.NewGuid();
        // User1Id < User2Id — sort them
        var (u1, u2) = userId.CompareTo(otherId) < 0 ? (userId, otherId) : (otherId, userId);

        var db = BuildDb();
        db.Users.AddRange(
            new User { Id = userId,  Username = "alice", Email = "a@x.com", PasswordHash = "x" },
            new User { Id = otherId, Username = "bob",   Email = "b@x.com", PasswordHash = "x" });
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        await db.SaveChangesAsync();

        var store    = Substitute.For<IPresenceStore>();
        var chatGrps = Substitute.For<IGroupManager>();
        var chatCtx  = Substitute.For<IHubContext<ChatHub>>();
        chatCtx.Groups.Returns(chatGrps);

        var hub = new PresenceHub(store, chatCtx, db);
        var ctx = Substitute.For<HubCallerContext>();
        ctx.ConnectionId.Returns("conn-1");
        ctx.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id",    userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test")));
        ctx.Items.Returns(new Dictionary<object, object?>());
        ctx.Features.Returns(Substitute.For<IFeatureCollection>());
        hub.Context = ctx;
        hub.Clients = Substitute.For<IHubCallerClients>();
        hub.Groups  = Substitute.For<IGroupManager>();

        await hub.JoinDialog(dialog.Id);

        await chatGrps.Received(1).AddToGroupAsync(
            "conn-1", $"dialog:{dialog.Id}", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task JoinDialog_DoesNotAddGroup_WhenNotParticipant()
    {
        var userId = Guid.NewGuid();
        var db     = BuildDb();
        db.Users.Add(new User { Id = userId, Username = "carol", Email = "c@x.com", PasswordHash = "x" });
        // Dialog between two other users — userId is NOT a participant
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var (u1, u2) = a.CompareTo(b) < 0 ? (a, b) : (b, a);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        await db.SaveChangesAsync();

        var store    = Substitute.For<IPresenceStore>();
        var chatGrps = Substitute.For<IGroupManager>();
        var chatCtx  = Substitute.For<IHubContext<ChatHub>>();
        chatCtx.Groups.Returns(chatGrps);

        var hub = new PresenceHub(store, chatCtx, db);
        var ctx = Substitute.For<HubCallerContext>();
        ctx.ConnectionId.Returns("conn-1");
        ctx.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id",    userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test")));
        ctx.Items.Returns(new Dictionary<object, object?>());
        ctx.Features.Returns(Substitute.For<IFeatureCollection>());
        hub.Context = ctx;
        hub.Clients = Substitute.For<IHubCallerClients>();
        hub.Groups  = Substitute.For<IGroupManager>();

        await hub.JoinDialog(dialog.Id);

        await chatGrps.DidNotReceive().AddToGroupAsync(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task LeaveDialog_RemovesConnectionFromChatHubDialogGroup()
    {
        var userId = Guid.NewGuid();
        var store    = Substitute.For<IPresenceStore>();
        var chatGrps = Substitute.For<IGroupManager>();
        var chatCtx  = Substitute.For<IHubContext<ChatHub>>();
        chatCtx.Groups.Returns(chatGrps);

        var hub = new PresenceHub(store, chatCtx, BuildDb());
        var ctx = Substitute.For<HubCallerContext>();
        ctx.ConnectionId.Returns("conn-1");
        ctx.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id",    userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test")));
        var dialogId = Guid.NewGuid();
        ctx.Items.Returns(new Dictionary<object, object?>
        {
            ["dialogs"] = new HashSet<Guid> { dialogId },
        });
        ctx.Features.Returns(Substitute.For<IFeatureCollection>());
        hub.Context = ctx;
        hub.Clients = Substitute.For<IHubCallerClients>();
        hub.Groups  = Substitute.For<IGroupManager>();

        await hub.LeaveDialog(dialogId);

        await chatGrps.Received(1).RemoveFromGroupAsync(
            "conn-1", $"dialog:{dialogId}", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task OnDisconnectedAsync_BroadcastsOffline_WithNonCancelledToken_EvenWhenAbortTokenIsCancelled()
    {
        // Regression test for: Context.ConnectionAborted is already cancelled when OnDisconnectedAsync
        // runs (transport tear-down). Passing it to SendAsync silently drops the offline event in
        // production. Fix: hub lifecycle broadcasts must use CancellationToken.None, not ct.
        var userId = Guid.NewGuid();
        var store  = Substitute.For<IPresenceStore>();
        store.GetTabCountAsync(userId).Returns(0L);  // last tab closed — should trigger offline broadcast

        var chatCtx = Substitute.For<IHubContext<ChatHub>>();
        chatCtx.Groups.Returns(Substitute.For<IGroupManager>());

        var hub = new PresenceHub(store, chatCtx, BuildDb());

        var ctx = Substitute.For<HubCallerContext>();
        ctx.ConnectionId.Returns("conn-1");
        ctx.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id",    userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test")));
        ctx.Items.Returns(new Dictionary<object, object?>());
        ctx.Features.Returns(Substitute.For<IFeatureCollection>());

        // Cancel the abort token before calling OnDisconnectedAsync — simulates transport tear-down
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();
        ctx.ConnectionAborted.Returns(cts.Token);

        hub.Context = ctx;

        var allProxy = Substitute.For<IClientProxy>();
        var clients  = Substitute.For<IHubCallerClients>();
        clients.All.Returns(allProxy);
        hub.Clients = clients;
        hub.Groups  = Substitute.For<IGroupManager>();

        await hub.OnDisconnectedAsync(null);

        // SendAsync must be called with CancellationToken.None (not the cancelled abort token)
        await allProxy.Received(1).SendCoreAsync(
            "UserStatusChanged",
            Arg.Any<object[]>(),
            Arg.Is<CancellationToken>(t => !t.IsCancellationRequested));
    }

    [Fact]
    public async Task OnDisconnectedAsync_CleansUpDialogGroups()
    {
        var userId   = Guid.NewGuid();
        var dialogId = Guid.NewGuid();

        var store    = Substitute.For<IPresenceStore>();
        store.GetTabCountAsync(userId).Returns(0);
        store.GetStatusAsync(userId).Returns((string?)"online");

        var chatGrps = Substitute.For<IGroupManager>();
        var chatCtx  = Substitute.For<IHubContext<ChatHub>>();
        chatCtx.Groups.Returns(chatGrps);

        var hub = new PresenceHub(store, chatCtx, BuildDb());
        var ctx = Substitute.For<HubCallerContext>();
        ctx.ConnectionId.Returns("conn-1");
        ctx.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id",    userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test")));
        ctx.Items.Returns(new Dictionary<object, object?>
        {
            ["dialogs"] = new HashSet<Guid> { dialogId },
        });
        ctx.Features.Returns(Substitute.For<IFeatureCollection>());
        hub.Context = ctx;

        var allProxy = Substitute.For<IClientProxy>();
        var clients  = Substitute.For<IHubCallerClients>();
        clients.All.Returns(allProxy);
        hub.Clients = clients;
        hub.Groups  = Substitute.For<IGroupManager>();

        await hub.OnDisconnectedAsync(null);

        await chatGrps.Received(1).RemoveFromGroupAsync(
            "conn-1", $"dialog:{dialogId}", Arg.Any<CancellationToken>());
    }
}
