using ChatHerder.Application.Ports;
using StackExchange.Redis;

namespace ChatHerder.Infrastructure.Cache;

public sealed class RedisPresenceStore(IConnectionMultiplexer redis) : IPresenceStore
{
    private IDatabase Db => redis.GetDatabase();

    private static RedisKey TabsKey(Guid userId)     => $"presence:tabs:{userId}";
    private static RedisKey AfkKey(Guid userId)      => $"afk_tabs:{userId}";
    private static RedisKey StatusKey(Guid userId)   => $"presence:status:{userId}";
    private static RedisKey ConnUserKey(string c)    => $"presence:conn:{c}";
    private static RedisKey ConnSessionKey(string c) => $"presence:session:{c}";
    private static RedisKey ActiveUsersKey()         => "active:users";

    public async Task RegisterTabAsync(Guid userId, string connId, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        await Db.SortedSetAddAsync(TabsKey(userId), connId, now);
    }

    public async Task UnregisterTabAsync(Guid userId, string connId, CancellationToken ct = default)
    {
        await Db.SortedSetRemoveAsync(TabsKey(userId), connId);
        await Db.SetRemoveAsync(AfkKey(userId), connId);
    }

    public async Task<long> GetTabCountAsync(Guid userId, CancellationToken ct = default)
        => await Db.SortedSetLengthAsync(TabsKey(userId));

    public async Task SetStatusAsync(Guid userId, string status, CancellationToken ct = default)
        => await Db.StringSetAsync(StatusKey(userId), status, TimeSpan.FromSeconds(90));

    public async Task<string?> GetStatusAsync(Guid userId, CancellationToken ct = default)
        => (string?)await Db.StringGetAsync(StatusKey(userId));

    public async Task SetAfkTabAsync(Guid userId, string connId, CancellationToken ct = default)
        => await Db.SetAddAsync(AfkKey(userId), connId);

    public async Task ClearAfkTabAsync(Guid userId, string connId, CancellationToken ct = default)
        => await Db.SetRemoveAsync(AfkKey(userId), connId);

    public async Task<bool> IsAllTabsAfkAsync(Guid userId, CancellationToken ct = default)
    {
        var tabCount = await Db.SortedSetLengthAsync(TabsKey(userId));
        if (tabCount == 0) return false;
        var afkCount = await Db.SetLengthAsync(AfkKey(userId));
        return afkCount >= tabCount;
    }

    public async Task<IReadOnlyList<string>> GetConnectionIdsAsync(Guid userId, CancellationToken ct = default)
    {
        var members = await Db.SortedSetRangeByRankAsync(TabsKey(userId));
        return members.Select(m => (string)m!).ToList();
    }

    public async Task SetConnUserAsync(string connId, Guid userId, CancellationToken ct = default)
        => await Db.StringSetAsync(ConnUserKey(connId), userId.ToString(), TimeSpan.FromSeconds(70));

    public async Task SetConnSessionAsync(string connId, Guid sessionId, CancellationToken ct = default)
        => await Db.StringSetAsync(ConnSessionKey(connId), sessionId.ToString(), TimeSpan.FromSeconds(70));

    public async Task<IReadOnlyList<(string ConnId, double Score)>> GetStaleTabsAsync(
        Guid userId, double threshold, CancellationToken ct = default)
    {
        var entries = await Db.SortedSetRangeByScoreWithScoresAsync(
            TabsKey(userId), start: 0, stop: threshold);
        return entries.Select(e => ((string)e.Element!, e.Score)).ToList();
    }

    public async Task RemoveStaleTabAsync(Guid userId, string connId, CancellationToken ct = default)
    {
        await Db.SortedSetRemoveAsync(TabsKey(userId), connId);
        await Db.SetRemoveAsync(AfkKey(userId), connId);
    }

    public async Task AddToActiveUsersAsync(Guid userId, CancellationToken ct = default)
        => await Db.SetAddAsync(ActiveUsersKey(), userId.ToString());

    public async Task RemoveFromActiveUsersAsync(Guid userId, CancellationToken ct = default)
        => await Db.SetRemoveAsync(ActiveUsersKey(), userId.ToString());

    public async Task<IReadOnlyList<Guid>> GetActiveUsersAsync(CancellationToken ct = default)
    {
        var members = await Db.SetMembersAsync(ActiveUsersKey());
        return members.Select(m => Guid.Parse((string)m!)).ToList();
    }
}
