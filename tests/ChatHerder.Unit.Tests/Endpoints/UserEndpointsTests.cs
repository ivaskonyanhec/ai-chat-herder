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

    [Fact]
    public async Task PatchMe_Returns400_WhenAvatarUrlIsJavascriptScheme()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var req = new UpdateMeRequest("javascript:alert(document.cookie)");
        var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(400, statusCode);
    }

    [Fact]
    public async Task PatchMe_Returns400_WhenAvatarUrlIsDataScheme()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var req = new UpdateMeRequest("data:text/html,<script>alert(1)</script>");
        var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(400, statusCode);
    }

    [Fact]
    public async Task PatchMe_Returns400_WhenAvatarUrlIsHttpScheme()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var req = new UpdateMeRequest("http://evil.com/img.png");
        var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(400, statusCode);
    }

    [Fact]
    public async Task PatchMe_Returns400_WhenAvatarUrlIsPlainBadValue()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var req = new UpdateMeRequest("badvalue");
        var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(400, statusCode);
    }

    [Fact]
    public async Task PatchMe_ReturnsOk_WhenAvatarUrlIsHttpsScheme()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var req = new UpdateMeRequest("https://cdn.example.com/avatar.png");
        var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

        Assert.IsType<Ok<UserDto>>(result);
    }

    [Fact]
    public async Task PatchMe_ReturnsOk_WhenAvatarUrlIsInternalFilePath()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var req = new UpdateMeRequest("/api/files/some-id");
        var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

        Assert.IsType<Ok<UserDto>>(result);
    }

    [Fact]
    public async Task PatchMe_ReturnsOk_WhenAvatarUrlIsRelativeFilePath()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var req = new UpdateMeRequest($"/api/files/{Guid.NewGuid()}");
        var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

        Assert.IsType<Ok<UserDto>>(result);
    }

    [Fact]
    public async Task PatchMe_Returns400_WhenAvatarUrlIsIconScheme()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var req = new UpdateMeRequest("icon:star");
        var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(400, statusCode);
    }

    [Fact]
    public async Task PatchMe_ReturnsOk_WhenAvatarUrlIsNull()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var req = new UpdateMeRequest(null);
        var result = await UserEndpointsTestHelper.PatchMe(req, MakePrincipal(user.Id), db, CancellationToken.None);

        Assert.IsType<Ok<UserDto>>(result);
    }

    [Fact]
    public async Task SearchUsers_ReturnsMatchingActiveUsers_ExcludingCaller()
    {
        await using var db = BuildContext();
        var caller = new User { Username = "admin", Email = "admin@test.com", PasswordHash = "x" };
        var match = new User { Username = "Alice", Email = "alice@test.com", PasswordHash = "x" };
        var otherMatch = new User { Username = "alina", Email = "alina@test.com", PasswordHash = "x" };
        var deleted = new User { Username = "ali_deleted", Email = "deleted@test.com", PasswordHash = "x", DeletedAt = DateTime.UtcNow };
        var nonMatch = new User { Username = "bob", Email = "bob@test.com", PasswordHash = "x" };
        db.Users.AddRange(caller, match, otherMatch, deleted, nonMatch);
        await db.SaveChangesAsync();

        var result = await UserEndpointsTestHelper.SearchUsers("ali", 8, MakePrincipal(caller.Id), db, CancellationToken.None);

        var ok = Assert.IsType<Ok<List<UserSearchResultDto>>>(result);
        Assert.Equal(["Alice", "alina"], ok.Value!.Select(u => u.Username));
    }

    [Fact]
    public async Task GetByUsername_ReturnsPublicDto_WithoutEmail()
    {
        await using var db = BuildContext();
        var user = new User { Username = "alice", Email = "alice@secret.com", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var result = await UserEndpointsTestHelper.GetByUsername("alice", db, CancellationToken.None);

        var ok = Assert.IsType<Ok<UserSearchResultDto>>(result);
        Assert.Equal("alice", ok.Value!.Username);
        Assert.Equal(user.Id, ok.Value.Id);
    }

    [Fact]
    public async Task GetByUsername_Returns404_WhenUserDoesNotExist()
    {
        await using var db = BuildContext();

        var result = await UserEndpointsTestHelper.GetByUsername("nobody", db, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(404, statusCode);
    }
}

internal static class UserEndpointsTestHelper
{
    public static Task<IResult> GetMe(ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.UserEndpoints.GetMeInternal(p, db, ct);

    public static Task<IResult> PatchMe(UpdateMeRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.UserEndpoints.PatchMeInternal(req, p, db, ct);

    public static Task<IResult> SearchUsers(string q, int limit, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.UserEndpoints.SearchUsersInternal(q, limit, p, db, ct);

    public static Task<IResult> GetByUsername(string name, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.UserEndpoints.GetByUsernameInternal(name, db, ct);
}
