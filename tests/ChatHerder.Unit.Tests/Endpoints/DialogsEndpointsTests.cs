using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class DialogsEndpointsTests
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
    public async Task CreateDialog_ReturnsOk_WithNewDialog()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.CreateDialog(
            new CreateDialogRequest(user2.Id), MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
        Assert.Equal(1, await db.PersonalDialogs.CountAsync());
        // invariant: User1Id < User2Id
        var dialog = await db.PersonalDialogs.SingleAsync();
        Assert.True(dialog.User1Id < dialog.User2Id);
    }

    [Fact]
    public async Task CreateDialog_ReturnsExistingDialog_WhenAlreadyExists()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        db.PersonalDialogs.Add(new PersonalDialog { User1Id = u1, User2Id = u2 });
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.CreateDialog(
            new CreateDialogRequest(user2.Id), MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
        Assert.Equal(1, await db.PersonalDialogs.CountAsync()); // no duplicate
    }

    [Fact]
    public async Task GetDialog_ReturnsOk_WhenParticipant()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.GetDialog(
            dialog.Id, MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
    }

    [Fact]
    public async Task GetDialog_Returns403_WhenNotParticipant()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        var user3 = new User { Username = "carol", Email = "carol@test.com", PasswordHash = "x" };
        db.Users.AddRange(user1, user2, user3);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.GetDialog(
            dialog.Id, MakePrincipal(user3.Id), db, CancellationToken.None);

        Assert.Equal(403, GetStatusCode(result));
    }

    [Fact]
    public async Task GetMessages_ReturnsOk_WithHistory()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        db.PersonalDialogMessages.Add(new PersonalDialogMessage
        {
            DialogId = dialog.Id, AuthorId = user1.Id, Content = "Hello", SequenceNumber = 1,
        });
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.GetMessages(
            dialog.Id, MakePrincipal(user1.Id), db, null, 50, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
    }

    [Fact]
    public async Task EditDmMessage_ReturnsOk_WhenSender()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        var msg = new PersonalDialogMessage
        {
            DialogId = dialog.Id, AuthorId = user1.Id, Content = "old", SequenceNumber = 1,
        };
        db.PersonalDialogMessages.Add(msg);
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.EditDmMessage(
            msg.Id, new EditDmMessageRequest("new content"), MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(200, GetStatusCode(result));
        var updated = await db.PersonalDialogMessages.FindAsync(msg.Id);
        Assert.Equal("new content", updated!.Content);
    }

    [Fact]
    public async Task DeleteDmMessage_ReturnsNoContent_WhenSender()
    {
        await using var db = BuildContext();
        var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
        var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
        db.Users.AddRange(user1, user2);
        var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
        var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
        db.PersonalDialogs.Add(dialog);
        var msg = new PersonalDialogMessage
        {
            DialogId = dialog.Id, AuthorId = user1.Id, Content = "bye", SequenceNumber = 1,
        };
        db.PersonalDialogMessages.Add(msg);
        await db.SaveChangesAsync();

        var result = await DialogsEndpointsHelper.DeleteDmMessage(
            msg.Id, MakePrincipal(user1.Id), db, CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        var updated = await db.PersonalDialogMessages.FindAsync(msg.Id);
        Assert.NotNull(updated!.DeletedAt);
    }
}

internal static class DialogsEndpointsHelper
{
    public static Task<IResult> CreateDialog(CreateDialogRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.DialogsEndpoints.CreateDialogInternal(req, p, db, ct);

    public static Task<IResult> GetDialog(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.DialogsEndpoints.GetDialogInternal(id, p, db, ct);

    public static Task<IResult> GetMessages(Guid id, ClaimsPrincipal p, AppDbContext db, Guid? before, int limit, CancellationToken ct)
        => ChatHerder.API.Endpoints.DialogsEndpoints.GetMessagesInternal(id, p, db, before, limit, ct);

    public static Task<IResult> EditDmMessage(Guid id, EditDmMessageRequest req, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.DialogsEndpoints.EditDmMessageInternal(id, req, p, db, ct);

    public static Task<IResult> DeleteDmMessage(Guid id, ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => ChatHerder.API.Endpoints.DialogsEndpoints.DeleteDmMessageInternal(id, p, db, ct);
}
