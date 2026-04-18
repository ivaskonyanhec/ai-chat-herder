using ChatHerder.Application.Ports;
using StackExchange.Redis;

namespace ChatHerder.Infrastructure.Cache;

public sealed class RedisUnreadStore(IConnectionMultiplexer redis) : IUnreadStore
{
    private IDatabase Db => redis.GetDatabase();

    private static RedisKey Key(Guid userId, string contextType, Guid contextId)
        => $"unread:{userId}:{contextType.ToLowerInvariant()}:{contextId}";

    public async Task IncrementAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default)
        => await Db.StringIncrementAsync(Key(userId, contextType, contextId));

    public async Task<long> GetCountAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default)
    {
        var val = await Db.StringGetAsync(Key(userId, contextType, contextId));
        return val.HasValue ? (long)val : 0;
    }

    public async Task ClearAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default)
        => await Db.KeyDeleteAsync(Key(userId, contextType, contextId));

    public async Task SetAsync(Guid userId, string contextType, Guid contextId, long count, CancellationToken ct = default)
        => await Db.StringSetAsync(Key(userId, contextType, contextId), count);

    public async Task<IReadOnlyList<(string ContextType, Guid ContextId, long Count)>> GetAllAsync(
        Guid userId,
        IReadOnlyList<(string ContextType, Guid ContextId)> contexts,
        CancellationToken ct = default)
    {
        if (contexts.Count == 0) return [];

        var keys = contexts.Select(c => Key(userId, c.ContextType, c.ContextId)).ToArray();
        var values = await Db.StringGetAsync(keys);
        var result = new List<(string, Guid, long)>(contexts.Count);

        for (var i = 0; i < contexts.Count; i++)
        {
            var count = values[i].HasValue ? (long)values[i] : 0;
            if (count > 0)
                result.Add((contexts[i].ContextType, contexts[i].ContextId, count));
        }

        return result;
    }
}
