using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class BlocksEndpointsTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(opts);
    }

    private static ClaimsPrincipal MakePrincipal(Guid userId) =>
        new(new ClaimsIdentity([
            new Claim("user_id", userId.ToString()),
        ], "Test"));

    private static int GetStatusCode(IResult r)
    {
        var prop = r.GetType().GetProperty("StatusCode");
        return (int)(prop?.GetValue(r) ?? 0);
    }

    [Fact]
    public async Task BlockUser_ReturnsNoContent_WhenValid()
    {
        await using var db = BuildContext();
        var blocker = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var target  = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(blocker, target);
        await db.SaveChangesAsync();

        var result = await BlocksEndpointsHelper.BlockUser(
            new BlockUserRequest(target.Id), MakePrincipal(blocker.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.UserBlocks.CountAsync());
    }

    [Fact]
    public async Task BlockUser_AlsoRemovesFriendship_WhenFriendshipExists()
    {
        await using var db = BuildContext();
        var blocker = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var target  = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(blocker, target);
        var (u1, u2) = blocker.Id < target.Id ? (blocker.Id, target.Id) : (target.Id, blocker.Id);
        db.Friendships.Add(new Friendship { User1Id = u1, User2Id = u2 });
        await db.SaveChangesAsync();

        await BlocksEndpointsHelper.BlockUser(
            new BlockUserRequest(target.Id), MakePrincipal(blocker.Id), db, CancellationToken.None);

        Assert.Equal(0, await db.Friendships.CountAsync());
    }

    [Fact]
    public async Task BlockUser_AlsoFreezesDialog_WhenDialogExists()
    {
        await using var db = BuildContext();
        var blocker = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var target  = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(blocker, target);
        var (u1, u2) = blocker.Id < target.Id ? (blocker.Id, target.Id) : (target.Id, blocker.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        await db.SaveChangesAsync();

        await BlocksEndpointsHelper.BlockUser(
            new BlockUserRequest(target.Id), MakePrincipal(blocker.Id), db, CancellationToken.None);

        var updated = await db.PersonalDialogs.FindAsync(dialog.Id);
        Assert.NotNull(updated!.FrozenAt);
    }

    [Fact]
    public async Task UnblockUser_ReturnsNoContent_WhenValid()
    {
        await using var db = BuildContext();
        var blocker = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var target  = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(blocker, target);
        db.UserBlocks.Add(new UserBlock { BlockerId = blocker.Id, BlockedUserId = target.Id });
        await db.SaveChangesAsync();

        var result = await BlocksEndpointsHelper.UnblockUser(
            target.Id, MakePrincipal(blocker.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(0, await db.UserBlocks.CountAsync());
    }
}

internal static class BlocksEndpointsHelper
{
    public static Task<IResult> BlockUser(BlockUserRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.BlocksEndpoints.BlockUserInternal(req, p, db, ct);

    public static Task<IResult> UnblockUser(Guid userId, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.BlocksEndpoints.UnblockUserInternal(userId, p, db, ct);
}
