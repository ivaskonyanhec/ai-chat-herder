using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class SessionsEndpoints
{
    public static RouteGroupBuilder MapSessionsEndpoints(this RouteGroupBuilder group)
    {
        group.RequireAuthorization();
        group.MapGet("/",          GetSessions);
        group.MapDelete("/{id}",   RevokeSession);
        group.MapDelete("/current", RevokeCurrentSession);
        return group;
    }

    private static async Task<IResult> GetSessions(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId    = Guid.Parse(principal.FindFirstValue("user_id")!);
        var sessionId = Guid.Parse(principal.FindFirstValue("session_id")!);

        var sessions = await db.Sessions
            .Where(s => s.UserId == userId && s.RevokedAt == null && s.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new SessionDto(
                s.Id, s.UserAgent, s.IpAddress, s.KeepSignedIn,
                s.CreatedAt, s.ExpiresAt, s.Id == sessionId))
            .ToListAsync(ct);

        return Results.Ok(sessions);
    }

    private static async Task<IResult> RevokeSession(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        ISessionStore sessions,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);

        var session = await db.Sessions
            .FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId, ct);

        if (session is null) return Results.NotFound();

        await sessions.RevokeAsync(userId, id, ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RevokeCurrentSession(
        ClaimsPrincipal principal,
        ISessionStore sessions,
        CancellationToken ct)
    {
        var userId    = Guid.Parse(principal.FindFirstValue("user_id")!);
        var sessionId = Guid.Parse(principal.FindFirstValue("session_id")!);
        await sessions.RevokeAsync(userId, sessionId, ct);
        return Results.NoContent();
    }
}
