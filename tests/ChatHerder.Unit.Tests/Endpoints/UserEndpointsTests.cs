using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class UserEndpointsTests
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
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test"));

    [Fact]
    public async Task GetMe_ReturnsUser_WhenExists()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var principal = MakePrincipal(user.Id);
        var result = await UserEndpointsTestHelper.GetMe(principal, db, CancellationToken.None);

        Assert.IsType<Ok<UserDto>>(result);
    }

    [Fact]
    public async Task GetMe_ReturnsNotFound_WhenUserDeleted()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x", DeletedAt = DateTime.UtcNow };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var principal = MakePrincipal(user.Id);
        var result = await UserEndpointsTestHelper.GetMe(principal, db, CancellationToken.None);

        Assert.IsType<NotFound>(result);
    }

    [Fact]
    public async Task PatchMe_Returns400_WhenAvatarUrlTooLong()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var req = new UpdateMeRequest(new string('a', 2049));
        var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(400, statusCode);
    }
}

internal static class UserEndpointsTestHelper
{
    public static Task<IResult> GetMe(ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.UserEndpoints.GetMeInternal(p, db, ct);

    public static Task<IResult> PatchMe(UpdateMeRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.UserEndpoints.PatchMeInternal(req, p, db, ct);
}
