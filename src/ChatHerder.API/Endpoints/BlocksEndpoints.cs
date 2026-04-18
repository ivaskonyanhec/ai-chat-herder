using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class BlocksEndpoints
{
    public static RouteGroupBuilder MapBlocksEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("",                   GetBlocks)   .RequireAuthorization();
        group.MapPost("",                  BlockUser)   .RequireAuthorization();
        group.MapDelete("/{userId:guid}",  UnblockUser) .RequireAuthorization();
        return group;
    }

    internal static Task<IResult> BlockUserInternal(BlockUserRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => BlockUser(req, p, db, ct);
    internal static Task<IResult> UnblockUserInternal(Guid userId, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => UnblockUser(userId, p, db, ct);

    private static async Task<IResult> GetBlocks(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var userId))
            return Results.Unauthorized();

        var blocks = await db.UserBlocks
            .Where(b => b.BlockerId == userId)
            .Include(b => b.BlockedUser)
            .Select(b => new BlockDto(b.BlockedUserId, b.BlockedUser.Username, b.BlockedUser.AvatarUrl, b.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(blocks);
    }

    private static async Task<IResult> BlockUser(
        BlockUserRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var blockerId))
            return Results.Unauthorized();

        if (req.UserId == blockerId)
            return Results.BadRequest(new { error = "Cannot block yourself." });

        var target = await db.Users.FirstOrDefaultAsync(u => u.Id == req.UserId && u.DeletedAt == null, ct);
        if (target is null) return Results.NotFound(new { error = "User not found." });

        if (await db.UserBlocks.AnyAsync(b => b.BlockerId == blockerId && b.BlockedUserId == req.UserId, ct))
            return Results.Conflict(new { error = "User is already blocked." });

        db.UserBlocks.Add(new UserBlock { BlockerId = blockerId, BlockedUserId = req.UserId });

        var (u1, u2) = blockerId < req.UserId ? (blockerId, req.UserId) : (req.UserId, blockerId);
        var friendship = await db.Friendships
            .FirstOrDefaultAsync(f => f.User1Id == u1 && f.User2Id == u2, ct);
        if (friendship is not null) db.Friendships.Remove(friendship);

        var dialog = await db.PersonalDialogs
            .FirstOrDefaultAsync(d => d.User1Id == u1 && d.User2Id == u2, ct);
        if (dialog is not null && dialog.FrozenAt is null)
            dialog.FrozenAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> UnblockUser(
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var blockerId))
            return Results.Unauthorized();

        var block = await db.UserBlocks
            .FirstOrDefaultAsync(b => b.BlockerId == blockerId && b.BlockedUserId == userId, ct);
        if (block is null) return Results.NotFound();

        db.UserBlocks.Remove(block);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
