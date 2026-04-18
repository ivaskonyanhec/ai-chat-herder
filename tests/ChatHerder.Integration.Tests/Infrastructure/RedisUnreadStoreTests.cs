using ChatHerder.Infrastructure.Cache;
using StackExchange.Redis;
using Testcontainers.Redis;

namespace ChatHerder.Integration.Tests.Infrastructure;

public sealed class RedisUnreadStoreTests : IAsyncLifetime
{
    private readonly RedisContainer _redis = new RedisBuilder().Build();
    private IConnectionMultiplexer _mux = null!;

    public async Task InitializeAsync()
    {
        await _redis.StartAsync();
        _mux = await ConnectionMultiplexer.ConnectAsync(_redis.GetConnectionString());
    }

    public async Task DisposeAsync()
    {
        _mux.Dispose();
        await _redis.DisposeAsync();
    }

    [Fact]
    public async Task IncrementAsync_ThenGetCountAsync_ReturnsCorrectCount()
    {
        var store = new RedisUnreadStore(_mux);
        var userId = Guid.NewGuid();
        var roomId = Guid.NewGuid();

        await store.IncrementAsync(userId, "room", roomId);
        await store.IncrementAsync(userId, "room", roomId);
        var count = await store.GetCountAsync(userId, "room", roomId);

        Assert.Equal(2, count);
    }

    [Fact]
    public async Task ClearAsync_ResetsCountToZero()
    {
        var store = new RedisUnreadStore(_mux);
        var userId = Guid.NewGuid();
        var roomId = Guid.NewGuid();

        await store.IncrementAsync(userId, "room", roomId);
        await store.ClearAsync(userId, "room", roomId);
        var count = await store.GetCountAsync(userId, "room", roomId);

        Assert.Equal(0, count);
    }
}
