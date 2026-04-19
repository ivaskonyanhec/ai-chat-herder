using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using ChatHerder.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NSubstitute;

namespace ChatHerder.Unit.Tests.Services;

public sealed class OrphanCleanupServiceTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new AppDbContext(opts);
    }

    [Fact]
    public async Task RunCleanupCoreAsync_DeletesOrphanOlderThan24Hours()
    {
        await using var db = BuildContext();
        var user = new User { Username = "u", Email = "u@x.com", PasswordHash = "x" };
        db.Users.Add(user);
        var orphan = new Attachment
        {
            UploadedByUserId = user.Id,
            StoragePath      = "old/file.txt",
            FileName         = "file.txt",
            ContentType      = "text/plain",
            SizeBytes        = 100,
            UploadedAt       = DateTime.UtcNow.AddHours(-25),
        };
        db.Attachments.Add(orphan);
        await db.SaveChangesAsync();

        var storage = Substitute.For<IFileStorage>();
        var logger  = Substitute.For<ILogger<OrphanCleanupService>>();

        await OrphanCleanupService.RunCleanupCoreAsync(db, storage, logger, CancellationToken.None);

        Assert.Empty(await db.Attachments.ToListAsync());
        await storage.Received(1).DeleteAsync("old/file.txt", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RunCleanupCoreAsync_PreservesLinkedAttachment()
    {
        await using var db = BuildContext();
        var user = new User { Username = "u", Email = "u@x.com", PasswordHash = "x" };
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = user.Id };
        db.Users.Add(user);
        db.Rooms.Add(room);
        var msg = new Message { RoomId = room.Id, AuthorId = user.Id, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        var linked = new Attachment
        {
            MessageId        = msg.Id,
            UploadedByUserId = user.Id,
            StoragePath      = "linked/file.txt",
            FileName         = "file.txt",
            ContentType      = "text/plain",
            SizeBytes        = 100,
            UploadedAt       = DateTime.UtcNow.AddHours(-48),
        };
        db.Attachments.Add(linked);
        await db.SaveChangesAsync();

        var storage = Substitute.For<IFileStorage>();
        var logger  = Substitute.For<ILogger<OrphanCleanupService>>();

        await OrphanCleanupService.RunCleanupCoreAsync(db, storage, logger, CancellationToken.None);

        Assert.Single(await db.Attachments.ToListAsync());
        await storage.DidNotReceive().DeleteAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RunCleanupCoreAsync_PreservesRecentOrphan()
    {
        await using var db = BuildContext();
        var user = new User { Username = "u", Email = "u@x.com", PasswordHash = "x" };
        db.Users.Add(user);
        var recent = new Attachment
        {
            UploadedByUserId = user.Id,
            StoragePath      = "new/file.txt",
            FileName         = "file.txt",
            ContentType      = "text/plain",
            SizeBytes        = 100,
            UploadedAt       = DateTime.UtcNow.AddHours(-1), // only 1h old
        };
        db.Attachments.Add(recent);
        await db.SaveChangesAsync();

        var storage = Substitute.For<IFileStorage>();
        var logger  = Substitute.For<ILogger<OrphanCleanupService>>();

        await OrphanCleanupService.RunCleanupCoreAsync(db, storage, logger, CancellationToken.None);

        Assert.Single(await db.Attachments.ToListAsync());
        await storage.DidNotReceive().DeleteAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }
}
