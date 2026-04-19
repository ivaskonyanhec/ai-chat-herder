using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
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
