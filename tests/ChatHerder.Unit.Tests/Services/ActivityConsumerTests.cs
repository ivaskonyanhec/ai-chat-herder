using ChatHerder.Application.DTOs;
using ChatHerder.Infrastructure.Persistence;
using ChatHerder.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.Unit.Tests.Services;

public sealed class ActivityConsumerTests
{
    private static AppDbContext BuildContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Fact]
    public async Task ProcessMessageAsync_InsertsActivityLog()
    {
        await using var db = BuildContext();
        var userId = Guid.NewGuid();
        var evt = new ActivityEvent(
            UserId: userId,
            EventType: "message.sent",
            Payload: "{\"roomId\":\"abc\"}",
            IpAddress: "10.0.0.1",
            OccurredAt: new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc));

        await ActivityConsumer.ProcessMessageAsync(db, evt, CancellationToken.None);

        var log = await db.ActivityLogs.SingleAsync();
        Assert.Equal("message.sent", log.EventType);
        Assert.Equal(userId, log.UserId);
        Assert.Contains("roomId", log.Payload);
        Assert.Equal(new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc), log.CreatedAt);
    }

    [Fact]
    public async Task ProcessMessageAsync_NullUserId_StillInserts()
    {
        await using var db = BuildContext();
        var evt = new ActivityEvent(
            UserId: Guid.Empty,
            EventType: "user.registered",
            Payload: "{}",
            IpAddress: null,
            OccurredAt: DateTime.UtcNow);

        await ActivityConsumer.ProcessMessageAsync(db, evt, CancellationToken.None);

        Assert.Single(await db.ActivityLogs.ToListAsync());
    }
}
