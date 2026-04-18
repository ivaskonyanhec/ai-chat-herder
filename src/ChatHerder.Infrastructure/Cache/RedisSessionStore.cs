using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

namespace ChatHerder.Infrastructure.Cache;

public sealed class RedisSessionStore(IConnectionMultiplexer redis, AppDbContext db) : ISessionStore
{
    private IDatabase Cache => redis.GetDatabase();

    private static RedisKey SessionSetKey(Guid userId) => $"sessions:valid:{userId}";

    public async Task AddAsync(Guid userId, Guid sessionId, CancellationToken ct = default)
        => await Cache.SetAddAsync(SessionSetKey(userId), sessionId.ToString());

    public async Task<bool> IsValidAsync(Guid userId, Guid sessionId, CancellationToken ct = default)
        => await Cache.SetContainsAsync(SessionSetKey(userId), sessionId.ToString());

    public async Task RevokeAsync(Guid userId, Guid sessionId, CancellationToken ct = default)
    {
        await Cache.SetRemoveAsync(SessionSetKey(userId), sessionId.ToString());

        var session = await db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId, ct);
        if (session is { RevokedAt: null })
        {
            session.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task RevokeAllAsync(Guid userId, Guid? exceptSessionId = null, CancellationToken ct = default)
    {
        if (exceptSessionId is null)
        {
            await Cache.KeyDeleteAsync(SessionSetKey(userId));
        }
        else
        {
            // Atomically replace the set with only the excepted session
            var tran = Cache.CreateTransaction();
            _ = tran.KeyDeleteAsync(SessionSetKey(userId));
            _ = tran.SetAddAsync(SessionSetKey(userId), exceptSessionId.ToString()!);
            await tran.ExecuteAsync();
        }

        var query = db.Sessions.Where(s => s.UserId == userId && s.RevokedAt == null);
        if (exceptSessionId is not null)
            query = query.Where(s => s.Id != exceptSessionId);

        await query.ExecuteUpdateAsync(
            s => s.SetProperty(x => x.RevokedAt, DateTime.UtcNow), ct);
    }
}
