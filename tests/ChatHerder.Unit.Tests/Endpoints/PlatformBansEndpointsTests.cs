using ChatHerder.API.Endpoints;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using StackExchange.Redis;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class PlatformBansEndpointsTests
{
    private static AppDbContext BuildDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static (IConnectionMultiplexer redis, IDatabase redisDb) BuildRedisMock()
    {
        var redis = Substitute.For<IConnectionMultiplexer>();
        var db    = Substitute.For<IDatabase>();
        redis.GetDatabase(Arg.Any<int>(), Arg.Any<object?>()).Returns(db);
        return (redis, db);
    }

    private static ClaimsPrincipal Caller(Guid userId) =>
        new(new ClaimsIdentity([new Claim("user_id", userId.ToString())], "Test"));

    private static ClaimsPrincipal NoClaim() =>
        new(new ClaimsIdentity([], "Test"));

    [Fact]
    public async Task GetBans_Returns200_WithList()
    {
        var db        = BuildDb();
        var adminId   = Guid.NewGuid();
        var targetId  = Guid.NewGuid();
        var admin  = new User { Id = adminId,  Username = "admin",  Email = "a@x.com", PasswordHash = "h" };
        var target = new User { Id = targetId, Username = "target", Email = "t@x.com", PasswordHash = "h" };
        db.Users.AddRange(admin, target);
        db.PlatformBans.Add(new PlatformBan
            { UserId = targetId, IssuedByAdminId = adminId, Reason = "spam" });
        await db.SaveChangesAsync();

        var result = await PlatformBansEndpoints.GetBansInternal(Caller(adminId), db, CancellationToken.None);

        var ok = Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Ok<List<ChatHerder.Application.DTOs.PlatformBanDto>>>(result);
        Assert.Single(ok.Value!);
        Assert.Equal("target", ok.Value[0].Username);
    }

    [Fact]
    public async Task IssueBan_Returns401_WhenNoClaim()
    {
        var db = BuildDb();
        var (redis, _) = BuildRedisMock();
        var result = await PlatformBansEndpoints.IssueBanInternal(
            new ChatHerder.Application.DTOs.IssuePlatformBanRequest("user", "spam", null),
            NoClaim(), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.UnauthorizedHttpResult>(result);
    }

    [Fact]
    public async Task IssueBan_Returns404_WhenUserNotFound()
    {
        var db        = BuildDb();
        var adminId   = Guid.NewGuid();
        var (redis, _) = BuildRedisMock();

        var result = await PlatformBansEndpoints.IssueBanInternal(
            new ChatHerder.Application.DTOs.IssuePlatformBanRequest("ghost", "spam", null),
            Caller(adminId), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.NotFound>(result);
    }

    [Fact]
    public async Task IssueBan_Returns204_AndSetsRedisKey()
    {
        var db        = BuildDb();
        var adminId   = Guid.NewGuid();
        var targetId  = Guid.NewGuid();
        var admin  = new User { Id = adminId,  Username = "admin",  Email = "a@x.com", PasswordHash = "h" };
        var target = new User { Id = targetId, Username = "target", Email = "t@x.com", PasswordHash = "h" };
        db.Users.AddRange(admin, target);
        await db.SaveChangesAsync();

        var (redis, redisDb) = BuildRedisMock();
        redisDb.StringSetAsync(Arg.Any<RedisKey>(), Arg.Any<RedisValue>(),
            Arg.Any<TimeSpan?>(), Arg.Any<When>(), Arg.Any<CommandFlags>())
            .Returns(Task.FromResult(true));

        var result = await PlatformBansEndpoints.IssueBanInternal(
            new ChatHerder.Application.DTOs.IssuePlatformBanRequest("target", "spam", 24),
            Caller(adminId), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.NoContent>(result);
        var ban = await db.PlatformBans.FirstOrDefaultAsync();
        Assert.NotNull(ban);
        Assert.Equal(targetId, ban.UserId);
        await redisDb.Received(1).StringSetAsync(
            $"ban:{targetId}", "1",
            Arg.Any<TimeSpan?>(), Arg.Any<When>(), Arg.Any<CommandFlags>());
    }

    [Fact]
    public async Task IssueBan_Returns409_WhenUserAlreadyBanned()
    {
        var db       = BuildDb();
        var adminId  = Guid.NewGuid();
        var targetId = Guid.NewGuid();
        var admin  = new User { Id = adminId,  Username = "admin",  Email = "a@x.com", PasswordHash = "h" };
        var target = new User { Id = targetId, Username = "target", Email = "t@x.com", PasswordHash = "h" };
        db.Users.AddRange(admin, target);
        db.PlatformBans.Add(new PlatformBan
            { UserId = targetId, IssuedByAdminId = adminId, Reason = "existing", RevokedAt = null });
        await db.SaveChangesAsync();

        var (redis, _) = BuildRedisMock();
        var result = await PlatformBansEndpoints.IssueBanInternal(
            new ChatHerder.Application.DTOs.IssuePlatformBanRequest("target", "spam", null),
            Caller(adminId), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Conflict>(result);
    }

    [Fact]
    public async Task RevokeBan_Returns404_WhenNoActiveBan()
    {
        var db       = BuildDb();
        var adminId  = Guid.NewGuid();
        var (redis, _) = BuildRedisMock();

        var result = await PlatformBansEndpoints.RevokeBanInternal(
            Guid.NewGuid(), Caller(adminId), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.NotFound>(result);
    }

    [Fact]
    public async Task RevokeBan_Returns204_AndDeletesRedisKey()
    {
        var db       = BuildDb();
        var adminId  = Guid.NewGuid();
        var targetId = Guid.NewGuid();
        var admin  = new User { Id = adminId,  Username = "admin",  Email = "a@x.com", PasswordHash = "h" };
        var target = new User { Id = targetId, Username = "target", Email = "t@x.com", PasswordHash = "h" };
        db.Users.AddRange(admin, target);
        db.PlatformBans.Add(new PlatformBan
            { UserId = targetId, IssuedByAdminId = adminId, Reason = "spam", RevokedAt = null });
        await db.SaveChangesAsync();

        var (redis, redisDb) = BuildRedisMock();
        redisDb.KeyDeleteAsync(Arg.Any<RedisKey>(), Arg.Any<CommandFlags>())
            .Returns(Task.FromResult(true));

        var result = await PlatformBansEndpoints.RevokeBanInternal(
            targetId, Caller(adminId), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.NoContent>(result);
        var ban = await db.PlatformBans.FirstOrDefaultAsync();
        Assert.NotNull(ban?.RevokedAt);
        await redisDb.Received(1).KeyDeleteAsync($"ban:{targetId}", Arg.Any<CommandFlags>());
    }
}
