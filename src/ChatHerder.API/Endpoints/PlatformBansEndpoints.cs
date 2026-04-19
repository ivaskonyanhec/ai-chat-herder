using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

namespace ChatHerder.API.Endpoints;

public static class PlatformBansEndpoints
{
    public static RouteGroupBuilder MapPlatformBansEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("",               GetBans)   .RequireAuthorization();
        group.MapPost("",              IssueBan)  .RequireAuthorization();
        group.MapDelete("/{userId:guid}", RevokeBan).RequireAuthorization();
        return group;
    }

    internal static Task<IResult> GetBansInternal(
        ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => GetBans(p, db, ct);

    internal static Task<IResult> IssueBanInternal(
        IssuePlatformBanRequest req, ClaimsPrincipal p, AppDbContext db,
        IConnectionMultiplexer redis, CancellationToken ct)
        => IssueBan(req, p, db, redis, ct);

    internal static Task<IResult> RevokeBanInternal(
        Guid userId, ClaimsPrincipal p, AppDbContext db,
        IConnectionMultiplexer redis, CancellationToken ct)
        => RevokeBan(userId, p, db, redis, ct);

    private static async Task<IResult> GetBans(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var bans = await db.PlatformBans
            .Include(b => b.User)
            .Include(b => b.IssuedByAdmin)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new PlatformBanDto(
                b.Id,
                b.UserId,
                b.User.Username,
                b.IssuedByAdminId,
                b.IssuedByAdmin.Username,
                b.Reason,
                b.CreatedAt,
                b.ExpiresAt,
                b.RevokedAt))
            .ToListAsync(ct);

        return Results.Ok(bans);
    }

    private static async Task<IResult> IssueBan(
        IssuePlatformBanRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        IConnectionMultiplexer redis,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var adminId))
            return Results.Unauthorized();

        var now = DateTime.UtcNow;

        var target = await db.Users.FirstOrDefaultAsync(
            u => u.Username == req.Username && u.DeletedAt == null, ct);
        if (target is null) return Results.NotFound();

        if (await db.PlatformBans.AnyAsync(b => b.UserId == target.Id && b.RevokedAt == null, ct))
            return Results.Conflict();

        DateTime? expiresAt = req.DurationHours.HasValue
            ? now.AddHours(req.DurationHours.Value)
            : null;

        db.PlatformBans.Add(new PlatformBan
        {
            UserId          = target.Id,
            IssuedByAdminId = adminId,
            Reason          = req.Reason,
            ExpiresAt       = expiresAt,
        });
        await db.SaveChangesAsync(ct);

        var redisDb = redis.GetDatabase();
        var expiry  = expiresAt.HasValue ? expiresAt.Value - now : (TimeSpan?)null;
        await redisDb.StringSetAsync($"ban:{target.Id}", "1", expiry, When.Always, CommandFlags.None);

        return Results.NoContent();
    }

    private static async Task<IResult> RevokeBan(
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        IConnectionMultiplexer redis,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var adminId))
            return Results.Unauthorized();

        var ban = await db.PlatformBans
            .FirstOrDefaultAsync(b => b.UserId == userId && b.RevokedAt == null
                && (b.ExpiresAt == null || b.ExpiresAt > DateTime.UtcNow), ct);
        if (ban is null) return Results.NotFound();

        ban.RevokedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var redisDb = redis.GetDatabase();
        await redisDb.KeyDeleteAsync($"ban:{userId}");
        return Results.NoContent();
    }
}
