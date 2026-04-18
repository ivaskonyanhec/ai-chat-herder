using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class RoomEndpointsTests
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
    public async Task CreateRoom_ReturnsOk_WithValidRequest()
    {
        await using var db = BuildContext();
        var owner = new User { Username = "owner", Email = "o@test.com", PasswordHash = "x" };
        db.Users.Add(owner);
        await db.SaveChangesAsync();

        var req = new CreateRoomRequest("general", "A room", "Public");
        var principal = MakePrincipal(owner.Id);
        var result = await RoomEndpointsHelper.CreateRoom(req, principal, db, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(1, await db.Rooms.CountAsync());
        Assert.Equal(1, await db.RoomMemberships.CountAsync());
    }

    [Fact]
    public async Task JoinRoom_Returns409_WhenAlreadyMember()
    {
        await using var db = BuildContext();
        var user = new User { Username = "u1", Email = "u1@test.com", PasswordHash = "x" };
        var owner = new User { Username = "owner", Email = "o@test.com", PasswordHash = "x" };
        db.Users.AddRange(user, owner);
        var room = new Room { Name = "general", Visibility = RoomVisibility.Public, OwnerId = owner.Id };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = user.Id, Role = MemberRole.Member });
        await db.SaveChangesAsync();

        var result = await RoomEndpointsHelper.JoinRoom(room.Id, MakePrincipal(user.Id), db, CancellationToken.None);

        Assert.Equal(409, GetStatusCode(result));
    }

    private static int GetStatusCode(IResult r)
    {
        var prop = r.GetType().GetProperty("StatusCode");
        return (int)(prop?.GetValue(r) ?? 0);
    }
}

internal static class RoomEndpointsHelper
{
    public static Task<IResult> CreateRoom(CreateRoomRequest req, System.Security.Claims.ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.RoomEndpoints.CreateRoomInternal(req, p, db, ct);
    public static Task<IResult> JoinRoom(Guid id, System.Security.Claims.ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.RoomEndpoints.JoinRoomInternal(id, p, db, ct);
}
