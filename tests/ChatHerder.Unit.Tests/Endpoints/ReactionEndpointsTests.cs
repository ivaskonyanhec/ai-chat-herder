using ChatHerder.API.Endpoints;
using ChatHerder.API.Hubs;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class ReactionEndpointsTests
{
    private static (AppDbContext db, SqliteConnection conn) BuildContext()
    {
        var conn = new SqliteConnection("DataSource=:memory:");
        conn.Open();
        var opts = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options;
        var db = new AppDbContext(opts);
        db.Database.EnsureCreated();
        return (db, conn);
    }

    private static ClaimsPrincipal Principal(Guid userId) =>
        new(new ClaimsIdentity([new Claim("user_id", userId.ToString())], "Test"));

    private static int StatusCode(IResult result) =>
        (int)(result.GetType().GetProperty("StatusCode")?.GetValue(result) ?? 0);

    private static (Room room, Guid ownerId) SeedRoom(AppDbContext db)
    {
        var ownerId = Guid.NewGuid();
        db.Users.Add(new User { Id = ownerId, Username = "owner", Email = "o@x.com", PasswordHash = "x" });
        var room = new Room { Name = "r1", OwnerId = ownerId, Visibility = RoomVisibility.Public };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = ownerId, Role = MemberRole.Owner });
        db.SaveChanges();
        return (room, ownerId);
    }

    private static Message SeedMessage(AppDbContext db, Guid roomId, Guid authorId)
    {
        var msg = new Message { RoomId = roomId, AuthorId = authorId, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        db.SaveChanges();
        return msg;
    }

    [Fact]
    public async Task ToggleReaction_AddsReaction_WhenNoneExists()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var (room, ownerId) = SeedRoom(db);
        var msg = SeedMessage(db, room.Id, ownerId);
        var chatHub = Substitute.For<IHubContext<ChatHub>>();
        chatHub.Clients.Returns(Substitute.For<IHubClients>());
        chatHub.Clients.Group(Arg.Any<string>()).Returns(Substitute.For<IClientProxy>());

        var result = await MessageEndpoints.ToggleReactionInternal(
            msg.Id, new ToggleReactionRequest("👍"), Principal(ownerId), db, chatHub, CancellationToken.None);

        Assert.Equal(StatusCodes.Status204NoContent, StatusCode(result));
        Assert.Single(db.MessageReactions.Where(r => r.MessageId == msg.Id && r.Emoji == "👍"));
    }

    [Fact]
    public async Task ToggleReaction_RemovesReaction_WhenAlreadyExists()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var (room, ownerId) = SeedRoom(db);
        var msg = SeedMessage(db, room.Id, ownerId);
        db.MessageReactions.Add(new MessageReaction { MessageId = msg.Id, UserId = ownerId, Emoji = "👍" });
        db.SaveChanges();
        var chatHub = Substitute.For<IHubContext<ChatHub>>();
        chatHub.Clients.Returns(Substitute.For<IHubClients>());
        chatHub.Clients.Group(Arg.Any<string>()).Returns(Substitute.For<IClientProxy>());

        var result = await MessageEndpoints.ToggleReactionInternal(
            msg.Id, new ToggleReactionRequest("👍"), Principal(ownerId), db, chatHub, CancellationToken.None);

        Assert.Equal(StatusCodes.Status204NoContent, StatusCode(result));
        Assert.Empty(db.MessageReactions.Where(r => r.MessageId == msg.Id && r.Emoji == "👍"));
    }

    [Fact]
    public async Task ToggleReaction_Returns404_WhenMessageNotFound()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var chatHub = Substitute.For<IHubContext<ChatHub>>();

        var result = await MessageEndpoints.ToggleReactionInternal(
            Guid.NewGuid(), new ToggleReactionRequest("👍"), Principal(Guid.NewGuid()), db, chatHub, CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, StatusCode(result));
    }

    [Fact]
    public async Task ToggleReaction_Returns403_WhenNotRoomMember()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var (room, ownerId) = SeedRoom(db);
        var msg = SeedMessage(db, room.Id, ownerId);
        var nonMember = Guid.NewGuid();
        db.Users.Add(new User { Id = nonMember, Username = "stranger", Email = "s@x.com", PasswordHash = "x" });
        db.SaveChanges();
        var chatHub = Substitute.For<IHubContext<ChatHub>>();

        var result = await MessageEndpoints.ToggleReactionInternal(
            msg.Id, new ToggleReactionRequest("👍"), Principal(nonMember), db, chatHub, CancellationToken.None);

        Assert.Equal(StatusCodes.Status403Forbidden, StatusCode(result));
    }

    [Fact]
    public async Task ToggleReaction_Returns400_WhenEmojiEmpty()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var chatHub = Substitute.For<IHubContext<ChatHub>>();

        var result = await MessageEndpoints.ToggleReactionInternal(
            Guid.NewGuid(), new ToggleReactionRequest(""), Principal(Guid.NewGuid()), db, chatHub, CancellationToken.None);

        Assert.Equal(StatusCodes.Status400BadRequest, StatusCode(result));
    }

    [Fact]
    public async Task ToggleReaction_BroadcastsReactionToggled_ViaSignalR()
    {
        var (db, conn) = BuildContext();
        await using var _ = db; await using var __ = conn;
        var (room, ownerId) = SeedRoom(db);
        var msg = SeedMessage(db, room.Id, ownerId);
        var clientProxy = Substitute.For<IClientProxy>();
        var chatHub = Substitute.For<IHubContext<ChatHub>>();
        chatHub.Clients.Returns(Substitute.For<IHubClients>());
        chatHub.Clients.Group($"room:{room.Id}").Returns(clientProxy);

        await MessageEndpoints.ToggleReactionInternal(
            msg.Id, new ToggleReactionRequest("❤️"), Principal(ownerId), db, chatHub, CancellationToken.None);

        await clientProxy.Received(1).SendCoreAsync(
            "ReactionToggled", Arg.Any<object[]>(), Arg.Any<CancellationToken>());
    }
}
