using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class MessageEndpointsTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new AppDbContext(opts);
    }

    [Fact]
    public async Task EditMessage_Returns403_WhenCallerIsNotAuthor()
    {
        await using var db = BuildContext();
        var author = new User { Username = "a", Email = "a@x.com", PasswordHash = "x" };
        var other  = new User { Username = "b", Email = "b@x.com", PasswordHash = "x" };
        db.Users.AddRange(author, other);
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = author.Id };
        db.Rooms.Add(room);
        var msg = new Message { RoomId = room.Id, AuthorId = author.Id, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();

        var principal = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("user_id", other.Id.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test"));

        var result = await MessageEndpointsHelper.EditMessage(
            msg.Id, new EditMessageRequest("changed"), principal, db, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(403, statusCode);
    }
}

internal static class MessageEndpointsHelper
{
    public static Task<IResult> EditMessage(Guid id, EditMessageRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.MessageEndpoints.EditMessageInternal(id, req, p, db, ct);
}
