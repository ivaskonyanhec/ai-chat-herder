using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class FilesEndpointsTests
{
    private static AppDbContext BuildContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new AppDbContext(opts);
    }

    private static ClaimsPrincipal Principal(Guid userId) =>
        new(new ClaimsIdentity([
            new Claim("user_id", userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test"));

    private static IFormFile MockFile(string contentType, long sizeBytes, string name = "file.dat")
    {
        var file = Substitute.For<IFormFile>();
        file.ContentType.Returns(contentType);
        file.Length.Returns(sizeBytes);
        file.FileName.Returns(name);
        file.OpenReadStream().Returns(new MemoryStream(new byte[sizeBytes > 100 ? 100 : (int)sizeBytes]));
        return file;
    }

    [Fact]
    public async Task UploadFile_Returns401_WhenNoClaim()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();
        var principal = new ClaimsPrincipal(new ClaimsIdentity());

        var result = await FilesEndpointsHelper.UploadFile(null, null, principal, db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(401, statusCode);
    }

    [Fact]
    public async Task UploadFile_Returns400_WhenNoFileProvided()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();

        var result = await FilesEndpointsHelper.UploadFile(null, null, Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(400, statusCode);
    }

    [Fact]
    public async Task UploadFile_Returns413_WhenImageExceeds3MB()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();
        var file = MockFile("image/jpeg", 4 * 1024 * 1024L); // 4 MB

        var result = await FilesEndpointsHelper.UploadFile(file, null, Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(413, statusCode);
    }

    [Fact]
    public async Task UploadFile_Returns413_WhenFileExceeds20MB()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();
        var file = MockFile("application/pdf", 21 * 1024 * 1024L); // 21 MB

        var result = await FilesEndpointsHelper.UploadFile(file, null, Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(413, statusCode);
    }

    [Fact]
    public async Task UploadFile_Returns201_AndCreatesAttachmentRow()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();
        storage.SaveAsync(Arg.Any<Stream>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
               .Returns("abc123/file.pdf");
        var userId = Guid.NewGuid();
        var file = MockFile("application/pdf", 1024L, "report.pdf");

        var result = await FilesEndpointsHelper.UploadFile(file, "Q4 report", Principal(userId), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(201, statusCode);

        var attachment = await db.Attachments.SingleAsync();
        Assert.Equal("report.pdf", attachment.FileName);
        Assert.Equal("Q4 report", attachment.Comment);
        Assert.Equal(userId, attachment.UploadedByUserId);
    }

    [Fact]
    public async Task GetFile_Returns404_WhenAttachmentNotFound()
    {
        await using var db = BuildContext();
        var storage = Substitute.For<IFileStorage>();

        var result = await FilesEndpointsHelper.GetFile(Guid.NewGuid(), Principal(Guid.NewGuid()), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(404, statusCode);
    }

    [Fact]
    public async Task GetFile_Returns403_WhenCallerIsNotRoomMember()
    {
        await using var db = BuildContext();
        var author = new User { Username = "a", Email = "a@x.com", PasswordHash = "x" };
        var caller = new User { Username = "b", Email = "b@x.com", PasswordHash = "x" };
        db.Users.AddRange(author, caller);
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = author.Id };
        db.Rooms.Add(room);
        var msg = new Message { RoomId = room.Id, AuthorId = author.Id, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        var att = new Attachment
        {
            MessageId = msg.Id, UploadedByUserId = author.Id,
            StoragePath = "a/f.txt", FileName = "f.txt", ContentType = "text/plain", SizeBytes = 10,
        };
        db.Attachments.Add(att);
        await db.SaveChangesAsync();
        var storage = Substitute.For<IFileStorage>();

        var result = await FilesEndpointsHelper.GetFile(att.Id, Principal(caller.Id), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(403, statusCode);
    }

    [Fact]
    public async Task GetFile_Returns403_WhenCallerIsBannedFromRoom()
    {
        await using var db = BuildContext();
        var author = new User { Username = "a", Email = "a@x.com", PasswordHash = "x" };
        var caller = new User { Username = "b", Email = "b@x.com", PasswordHash = "x" };
        db.Users.AddRange(author, caller);
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = author.Id };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = caller.Id, Role = MemberRole.Member });
        db.RoomBans.Add(new RoomBan { RoomId = room.Id, BannedUserId = caller.Id, BannedByUserId = author.Id, Reason = "test" });
        var msg = new Message { RoomId = room.Id, AuthorId = author.Id, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        var att = new Attachment
        {
            MessageId = msg.Id, UploadedByUserId = author.Id,
            StoragePath = "a/f.txt", FileName = "f.txt", ContentType = "text/plain", SizeBytes = 10,
        };
        db.Attachments.Add(att);
        await db.SaveChangesAsync();
        var storage = Substitute.For<IFileStorage>();

        var result = await FilesEndpointsHelper.GetFile(att.Id, Principal(caller.Id), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(403, statusCode);
    }

    [Fact]
    public async Task GetFile_Returns403_WhenCallerIsNotDialogParticipant()
    {
        await using var db = BuildContext();
        var u1 = new User { Username = "u1", Email = "u1@x.com", PasswordHash = "x" };
        var u2 = new User { Username = "u2", Email = "u2@x.com", PasswordHash = "x" };
        var stranger = new User { Username = "s", Email = "s@x.com", PasswordHash = "x" };
        db.Users.AddRange(u1, u2, stranger);
        var (lo, hi) = u1.Id < u2.Id ? (u1.Id, u2.Id) : (u2.Id, u1.Id);
        var dialog = new PersonalDialog { User1Id = lo, User2Id = hi };
        db.PersonalDialogs.Add(dialog);
        var dmMsg = new PersonalDialogMessage { DialogId = dialog.Id, AuthorId = u1.Id, Content = "hi", SequenceNumber = 1 };
        db.PersonalDialogMessages.Add(dmMsg);
        var att = new Attachment
        {
            PersonalDialogMessageId = dmMsg.Id, UploadedByUserId = u1.Id,
            StoragePath = "a/f.txt", FileName = "f.txt", ContentType = "text/plain", SizeBytes = 10,
        };
        db.Attachments.Add(att);
        await db.SaveChangesAsync();
        var storage = Substitute.For<IFileStorage>();

        var result = await FilesEndpointsHelper.GetFile(att.Id, Principal(stranger.Id), db, storage, CancellationToken.None);

        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.Equal(403, statusCode);
    }

    [Fact]
    public async Task GetFile_ReturnsFileStream_WhenCallerIsRoomMember()
    {
        await using var db = BuildContext();
        var author = new User { Username = "a", Email = "a@x.com", PasswordHash = "x" };
        var caller = new User { Username = "b", Email = "b@x.com", PasswordHash = "x" };
        db.Users.AddRange(author, caller);
        var room = new Room { Name = "r", Visibility = RoomVisibility.Public, OwnerId = author.Id };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = caller.Id, Role = MemberRole.Member });
        var msg = new Message { RoomId = room.Id, AuthorId = author.Id, Content = "hi", SequenceNumber = 1 };
        db.Messages.Add(msg);
        var att = new Attachment
        {
            MessageId = msg.Id, UploadedByUserId = author.Id,
            StoragePath = "a/f.txt", FileName = "f.txt", ContentType = "text/plain", SizeBytes = 10,
        };
        db.Attachments.Add(att);
        await db.SaveChangesAsync();
        var storage = Substitute.For<IFileStorage>();
        storage.OpenReadAsync("a/f.txt", Arg.Any<CancellationToken>())
               .Returns(new MemoryStream("content"u8.ToArray()));

        var result = await FilesEndpointsHelper.GetFile(att.Id, Principal(caller.Id), db, storage, CancellationToken.None);

        // FileStreamHttpResult (from Results.Stream) returns StatusCode = null (implicit 200)
        var statusCode = result.GetType().GetProperty("StatusCode")?.GetValue(result);
        Assert.True(statusCode is null || (int)statusCode == 200, $"Expected 200 or null, got {statusCode}");
    }
}

internal static class FilesEndpointsHelper
{
    public static Task<IResult> UploadFile(
        IFormFile? file, string? comment, ClaimsPrincipal p,
        AppDbContext db, IFileStorage storage, CancellationToken ct)
        => ChatHerder.API.Endpoints.FilesEndpoints.UploadFileInternal(file, comment, p, db, storage, ct);

    public static Task<IResult> GetFile(
        Guid id, ClaimsPrincipal p,
        AppDbContext db, IFileStorage storage, CancellationToken ct)
        => ChatHerder.API.Endpoints.FilesEndpoints.GetFileInternal(id, p, db, storage, ct);
}
