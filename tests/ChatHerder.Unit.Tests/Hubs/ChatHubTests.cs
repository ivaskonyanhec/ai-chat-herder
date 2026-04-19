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

public sealed class ChatHubTests
{
    private static AppDbContext BuildDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static ChatHub BuildHub(AppDbContext db, Guid userId,
        IUnreadStore? unread = null, IPresenceStore? presence = null)
    {
        var hub = new ChatHub(db,
            unread   ?? Substitute.For<IUnreadStore>(),
            presence ?? Substitute.For<IPresenceStore>());

        var context = Substitute.For<HubCallerContext>();
        context.ConnectionId.Returns("conn-chat");
        context.User.Returns(new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id",    userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test")));
        context.Items.Returns(new Dictionary<object, object?>());
        context.Features.Returns(Substitute.For<IFeatureCollection>());
        hub.Context = context;

        hub.Clients = Substitute.For<IHubCallerClients>();
        hub.Groups  = Substitute.For<IGroupManager>();

        return hub;
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenCallerIsNotMember()
    {
        var userId = Guid.NewGuid();
        var roomId = Guid.NewGuid();
        var hub    = BuildHub(BuildDb(), userId);

        await Assert.ThrowsAsync<HubException>(() => hub.SendMessage(roomId, "hello"));
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenCallerIsBanned()
    {
        var userId = Guid.NewGuid();
        var db     = BuildDb();
        var room   = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = userId };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership
            { RoomId = room.Id, UserId = userId, Role = MemberRole.Member });
        db.RoomBans.Add(new RoomBan
            { RoomId = room.Id, BannedUserId = userId, BannedByUserId = Guid.NewGuid(), RevokedAt = null });
        await db.SaveChangesAsync();

        var hub = BuildHub(db, userId);

        await Assert.ThrowsAsync<HubException>(() => hub.SendMessage(room.Id, "hello"));
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenContentIsEmpty()
    {
        var userId = Guid.NewGuid();
        var db     = BuildDb();
        var room   = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = userId };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership
            { RoomId = room.Id, UserId = userId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var hub = BuildHub(db, userId);

        await Assert.ThrowsAsync<HubException>(() => hub.SendMessage(room.Id, "   "));
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenContentExceedsLimit()
    {
        var userId  = Guid.NewGuid();
        var db      = BuildDb();
        var room    = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = userId };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership
            { RoomId = room.Id, UserId = userId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var hub = BuildHub(db, userId);

        await Assert.ThrowsAsync<HubException>(() => hub.SendMessage(room.Id, new string('x', 4000)));
    }

    [Fact]
    public async Task EditMessage_ThrowsHubException_WhenCallerIsNotAuthor()
    {
        var authorId = Guid.NewGuid();
        var otherId  = Guid.NewGuid();
        var db       = BuildDb();
        db.Users.AddRange(
            new User { Id = authorId, Username = "author", Email = "a@x.com", PasswordHash = "x" },
            new User { Id = otherId,  Username = "other",  Email = "b@x.com", PasswordHash = "x" });
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = authorId };
        db.Rooms.Add(room);
        db.Messages.Add(new Message
            { RoomId = room.Id, AuthorId = authorId, Content = "hi", SequenceNumber = 1 });
        await db.SaveChangesAsync();
        var msg = db.Messages.First();

        var hub = BuildHub(db, otherId);

        await Assert.ThrowsAsync<HubException>(() => hub.EditMessage(msg.Id, "changed"));
    }

    [Fact]
    public void ChatHub_CanBeInstantiated_WithMockedDependencies()
    {
        var hub = new ChatHub(BuildDb(), Substitute.For<IUnreadStore>(), Substitute.For<IPresenceStore>());
        Assert.NotNull(hub);
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenNoContentAndNoAttachment()
    {
        var userId = Guid.NewGuid();
        var hub    = BuildHub(BuildDb(), userId);

        // Whitespace content and no attachmentId → must throw
        await Assert.ThrowsAsync<HubException>(() => hub.SendMessage(Guid.NewGuid(), "   "));
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenAttachmentNotFound()
    {
        var userId = Guid.NewGuid();
        var db     = BuildDb();
        var user   = new User { Id = userId, Username = "u", Email = "u@x.com", PasswordHash = "x" };
        var room   = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = userId };
        db.Users.Add(user);
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = userId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var hub = BuildHub(db, userId);

        // Non-existent attachmentId → must throw
        await Assert.ThrowsAsync<HubException>(
            () => hub.SendMessage(room.Id, "hello", null, Guid.NewGuid()));
    }

    [Fact]
    public async Task SendMessage_ThrowsHubException_WhenAttachmentAlreadyLinked()
    {
        var userId    = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        var db        = BuildDb();
        var user      = new User { Id = userId, Username = "u", Email = "u@x.com", PasswordHash = "x" };
        var room      = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = userId };
        db.Users.Add(user);
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = userId, Role = MemberRole.Owner });
        var linked = new Attachment
        {
            UploadedByUserId = userId,
            MessageId        = messageId,   // already linked
            StoragePath      = "a/f.txt",
            FileName         = "f.txt",
            ContentType      = "text/plain",
            SizeBytes        = 10,
        };
        db.Attachments.Add(linked);
        await db.SaveChangesAsync();

        var hub = BuildHub(db, userId);

        // Attachment already linked → must throw
        await Assert.ThrowsAsync<HubException>(
            () => hub.SendMessage(room.Id, "hello", null, linked.Id));
    }
}
