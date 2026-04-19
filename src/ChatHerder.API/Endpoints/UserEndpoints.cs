using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class UserEndpoints
{
    public static RouteGroupBuilder MapUserEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/me", GetMe).RequireAuthorization();
        group.MapPatch("/me", PatchMe).RequireAuthorization();
        group.MapGet("/search", SearchUsers).RequireAuthorization();
        group.MapGet("/by-username/{name}", GetByUsername).RequireAuthorization();
        return group;
    }

    internal static Task<IResult> GetMeInternal(ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => GetMe(p, db, ct);

    internal static Task<IResult> PatchMeInternal(UpdateMeRequest req, ClaimsPrincipal p, AppDbContext db,
        CancellationToken ct)
        => PatchMe(req, p, db, ct);

    internal static Task<IResult> SearchUsersInternal(string q, int limit, ClaimsPrincipal p, AppDbContext db,
        CancellationToken ct)
        => SearchUsers(q, limit, p, db, ct);

    private static async Task<IResult> GetMe(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.DeletedAt == null, ct);
        if (user is null) return Results.NotFound();
        return Results.Ok(new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl));
    }

    private static async Task<IResult> PatchMe(
        UpdateMeRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.DeletedAt == null, ct);
        if (user is null) return Results.NotFound();

        if (req.AvatarUrl is not null)
        {
            if (req.AvatarUrl.Length > 2048)
                return Results.BadRequest(new { error = "Avatar URL must be ≤ 2048 characters." });
            user.AvatarUrl = req.AvatarUrl;
        }

        await db.SaveChangesAsync(ct);
        return Results.Ok(new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl));
    }

    private static async Task<IResult> GetByUsername(
        string name,
        AppDbContext db,
        CancellationToken ct)
    {
        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Username == name && u.DeletedAt == null, ct);
        if (user is null) return Results.NotFound();
        return Results.Ok(new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl));
    }

    private static async Task<IResult> SearchUsers(
        string q,
        int limit,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
            return Results.Unauthorized();

        var query = q.Trim();
        if (query.Length < 2)
            return Results.Ok(Array.Empty<UserSearchResultDto>());

        var normalized = query.ToLower();
        var take = Math.Clamp(limit, 1, 20);
        var users = await db.Users
            .Where(u => u.Id != callerId
                && u.DeletedAt == null
                && u.Username.ToLower().Contains(normalized))
            .OrderBy(u => u.Username)
            .Take(take)
            .Select(u => new UserSearchResultDto(u.Id, u.Username, u.AvatarUrl))
            .ToListAsync(ct);

        return Results.Ok(users);
    }
}
