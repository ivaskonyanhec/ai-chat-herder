using ChatHerder.API.Endpoints;
using ChatHerder.API.Hubs;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class AuthEndpointsTests
{
    private static (AppDbContext db, SqliteConnection conn) BuildContext()
    {
        var conn = new SqliteConnection("DataSource=:memory:");
        conn.Open();
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(conn)
            .Options;
        var db = new AppDbContext(opts);
        db.Database.EnsureCreated();
        return (db, conn);
    }

    private static ClaimsPrincipal Principal(Guid userId) =>
        new(new ClaimsIdentity([
            new Claim("user_id", userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test"));

    private static int StatusCode(IResult result) =>
        (int)(result.GetType().GetProperty("StatusCode")?.GetValue(result) ?? 0);

    [Fact]
    public async Task DeleteAccount_DeletesOwnedRoomsAndFiles()
    {
        var (db, conn) = BuildContext();
        await using var _ = db;
        await using var __ = conn;
        var userId = Guid.NewGuid();
        db.Users.Add(new User { Id = userId, Username = "alice", Email = "a@x.com", PasswordHash = "x" });
        var room = new Room { Name = "r", OwnerId = userId, Visibility = RoomVisibility.Public };
        db.Rooms.Add(room);
        var msg = new Message
        {
            RoomId         = room.Id,
            AuthorId       = userId,
            Content        = "hi",
            SentAt         = DateTime.UtcNow,
            SequenceNumber = 1,
        };
        db.Messages.Add(msg);
        var att = new Attachment
        {
            MessageId        = msg.Id,
            UploadedByUserId = userId,
            StoragePath      = "uploads/f.png",
            FileName         = "f.png",
            ContentType      = "image/png",
            SizeBytes        = 1,
        };
        db.Attachments.Add(att);
        await db.SaveChangesAsync();

        var sessions    = Substitute.For<ISessionStore>();
        var storage     = Substitute.For<IFileStorage>();
        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(userId, Arg.Any<CancellationToken>()).Returns(Array.Empty<string>());
        var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
        var hubClients  = Substitute.For<IHubClients>();
        presenceHub.Clients.Returns(hubClients);
        var singleClientProxy = Substitute.For<ISingleClientProxy>();
        hubClients.Client(Arg.Any<string>()).Returns(singleClientProxy);

        var result = await AuthEndpointsHelper.DeleteAccount(
            Principal(userId), db, sessions, storage, presence, presenceHub, CancellationToken.None);

        Assert.Equal(204, StatusCode(result));
        await storage.Received(1).DeleteAsync("uploads/f.png", Arg.Any<CancellationToken>());
        Assert.False(await db.Rooms.AnyAsync(r => r.OwnerId == userId));
        Assert.False(await db.Messages.AnyAsync(m => m.RoomId == room.Id));
    }

    [Fact]
    public async Task DeleteAccount_SendsForceDisconnect_ToAllConnections()
    {
        var (db, conn) = BuildContext();
        await using var _ = db;
        await using var __ = conn;
        var userId = Guid.NewGuid();
        db.Users.Add(new User { Id = userId, Username = "bob", Email = "b@x.com", PasswordHash = "x" });
        await db.SaveChangesAsync();

        var sessions    = Substitute.For<ISessionStore>();
        var storage     = Substitute.For<IFileStorage>();
        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(userId, Arg.Any<CancellationToken>()).Returns(new[] { "conn-1", "conn-2" });
        var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
        var hubClients  = Substitute.For<IHubClients>();
        presenceHub.Clients.Returns(hubClients);
        var clientProxy = Substitute.For<ISingleClientProxy>();
        hubClients.Client(Arg.Any<string>()).Returns(clientProxy);

        await AuthEndpointsHelper.DeleteAccount(
            Principal(userId), db, sessions, storage, presence, presenceHub, CancellationToken.None);

        // Verify each connection ID was targeted exactly once
        hubClients.Received(1).Client("conn-1");
        hubClients.Received(1).Client("conn-2");
        // Verify ForceDisconnect was sent (no stray args — the correct overload sends zero args)
        await clientProxy.Received(2).SendCoreAsync(
            "ForceDisconnect", Arg.Is<object[]>(a => a.Length == 0), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DeleteAccount_AnonymizesEmailAndUsername()
    {
        var (db, conn) = BuildContext();
        await using var _ = db;
        await using var __ = conn;
        var userId = Guid.NewGuid();
        db.Users.Add(new User { Id = userId, Username = "carol", Email = "carol@x.com", PasswordHash = "x" });
        await db.SaveChangesAsync();

        var sessions    = Substitute.For<ISessionStore>();
        var storage     = Substitute.For<IFileStorage>();
        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(userId, Arg.Any<CancellationToken>()).Returns(Array.Empty<string>());
        var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
        presenceHub.Clients.Returns(Substitute.For<IHubClients>());

        await AuthEndpointsHelper.DeleteAccount(
            Principal(userId), db, sessions, storage, presence, presenceHub, CancellationToken.None);

        // AsNoTracking bypasses the EF change-tracker cache so we see the raw-SQL update
        var row = await db.Users.AsNoTracking().FirstAsync(u => u.Id == userId);
        Assert.NotNull(row.DeletedAt);
        Assert.Equal($"deleted.{userId:N}@deleted.invalid", row.Email);
        Assert.Equal(userId.ToString("N"), row.Username);
        // Session revocation must fire even if SignalR broadcast has no connections
        await sessions.Received(1).RevokeAllAsync(userId, ct: Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DeleteAccount_AllowsReregistrationWithSameEmail()
    {
        var (db, conn) = BuildContext();
        await using var _ = db;
        await using var __ = conn;
        var userId = Guid.NewGuid();
        const string email    = "reuse@x.com";
        const string username = "original_dave";
        db.Users.Add(new User { Id = userId, Username = username, Email = email, PasswordHash = "x" });
        await db.SaveChangesAsync();

        var sessions    = Substitute.For<ISessionStore>();
        var storage     = Substitute.For<IFileStorage>();
        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(userId, Arg.Any<CancellationToken>()).Returns(Array.Empty<string>());
        var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
        presenceHub.Clients.Returns(Substitute.For<IHubClients>());

        await AuthEndpointsHelper.DeleteAccount(
            Principal(userId), db, sessions, storage, presence, presenceHub, CancellationToken.None);

        var hasher   = Substitute.For<IPasswordHasher>();
        hasher.Hash(Arg.Any<string>()).Returns("hash");
        var jwt      = Substitute.For<IJwtTokenService>();
        jwt.GenerateRawRefreshToken().Returns("raw");
        jwt.HashRefreshToken(Arg.Any<string>()).Returns("hashed");
        jwt.GenerateAccessToken(Arg.Any<Guid>(), Arg.Any<Guid>()).Returns("tok");
        var sessions2 = Substitute.For<ISessionStore>();

        var result = await AuthEndpointsHelper.Register(
            new RegisterRequest("new_dave", email, "password123", true),
            db, hasher, jwt, sessions2, new DefaultHttpContext(), CancellationToken.None);

        Assert.Equal(200, StatusCode(result));
    }

    [Fact]
    public async Task DeleteAccount_AllowsReregistrationWithSameUsername()
    {
        var (db, conn) = BuildContext();
        await using var _ = db;
        await using var __ = conn;
        var userId = Guid.NewGuid();
        const string username = "taken_username";
        db.Users.Add(new User { Id = userId, Username = username, Email = "e@x.com", PasswordHash = "x" });
        await db.SaveChangesAsync();

        var sessions    = Substitute.For<ISessionStore>();
        var storage     = Substitute.For<IFileStorage>();
        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(userId, Arg.Any<CancellationToken>()).Returns(Array.Empty<string>());
        var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
        presenceHub.Clients.Returns(Substitute.For<IHubClients>());

        await AuthEndpointsHelper.DeleteAccount(
            Principal(userId), db, sessions, storage, presence, presenceHub, CancellationToken.None);

        var hasher   = Substitute.For<IPasswordHasher>();
        hasher.Hash(Arg.Any<string>()).Returns("hash");
        var jwt      = Substitute.For<IJwtTokenService>();
        jwt.GenerateRawRefreshToken().Returns("raw");
        jwt.HashRefreshToken(Arg.Any<string>()).Returns("hashed");
        jwt.GenerateAccessToken(Arg.Any<Guid>(), Arg.Any<Guid>()).Returns("tok");

        var result = await AuthEndpointsHelper.Register(
            new RegisterRequest(username, "new_email@x.com", "password123", true),
            db, hasher, jwt, Substitute.For<ISessionStore>(), new DefaultHttpContext(), CancellationToken.None);

        Assert.Equal(200, StatusCode(result));
    }
}

internal static class AuthEndpointsHelper
{
    public static Task<IResult> DeleteAccount(
        ClaimsPrincipal principal,
        AppDbContext db,
        ISessionStore sessions,
        IFileStorage storage,
        IPresenceStore presence,
        IHubContext<PresenceHub> presenceHub,
        CancellationToken ct)
        => ChatHerder.API.Endpoints.AuthEndpoints.DeleteAccountInternal(
            principal, db, sessions, storage, presence, presenceHub, ct);

    public static Task<IResult> Register(
        RegisterRequest req,
        AppDbContext db,
        IPasswordHasher hasher,
        IJwtTokenService jwt,
        ISessionStore sessions,
        HttpContext ctx,
        CancellationToken ct)
        => ChatHerder.API.Endpoints.AuthEndpoints.RegisterInternal(req, db, hasher, jwt, sessions, ctx, ct);
}
