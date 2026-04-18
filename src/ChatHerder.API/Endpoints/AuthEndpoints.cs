using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Endpoints;

public static class AuthEndpoints
{
    // 16 zero bytes (salt) + 32 zero bytes (hash) in self-describing base64 format.
    // Segments: Convert.ToBase64String(new byte[16]) = 22 A's + "==" (24 chars);
    //           Convert.ToBase64String(new byte[32]) = 43 A's + "="  (44 chars).
    // Both are multiples of 4 so Convert.FromBase64String succeeds and Argon2id always runs,
    // making missing vs. wrong-password timing indistinguishable (~100 ms in both paths).
    private const string SentinelHash =
        "AAAAAAAAAAAAAAAAAAAAAA==.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    public static RouteGroupBuilder MapAuthEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/register",        Register)       .AllowAnonymous();
        group.MapPost("/login",           Login)          .AllowAnonymous();
        group.MapPost("/logout",          Logout)         .RequireAuthorization();
        group.MapPost("/refresh",         Refresh)        .AllowAnonymous();
        group.MapPost("/forgot-password", ForgotPassword) .AllowAnonymous();
        group.MapPost("/reset-password",  ResetPassword)  .AllowAnonymous();
        group.MapPost("/change-password", ChangePassword) .RequireAuthorization();
        group.MapDelete("/account",       DeleteAccount)  .RequireAuthorization();
        return group;
    }

    // ── Register ───────────────────────────────────────────────────────────────
    private static async Task<IResult> Register(
        RegisterRequest req,
        AppDbContext db,
        IPasswordHasher hasher,
        IJwtTokenService jwt,
        ISessionStore sessions,
        HttpContext ctx,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || req.Username.Length > 32)
            return Results.BadRequest(new { error = "Username must be 1–32 characters." });
        if (string.IsNullOrWhiteSpace(req.Email) || req.Email.Length > 254 || !req.Email.Contains('@'))
            return Results.BadRequest(new { error = "Invalid email address." });
        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
            return Results.BadRequest(new { error = "Password must be at least 8 characters." });

        if (await db.Users.AnyAsync(u => u.Username == req.Username && u.DeletedAt == null, ct))
            return Results.Conflict(new { error = "Username is already taken." });
        if (await db.Users.AnyAsync(u => u.Email == req.Email && u.DeletedAt == null, ct))
            return Results.Conflict(new { error = "Email is already registered." });

        var user = new User
        {
            Username     = req.Username,
            Email        = req.Email,
            PasswordHash = hasher.Hash(req.Password),
        };
        db.Users.Add(user);

        var rawRefresh = jwt.GenerateRawRefreshToken();
        var sessionId  = Guid.NewGuid();
        var session = new Session
        {
            Id           = sessionId,
            UserId       = user.Id,
            RefreshToken = jwt.HashRefreshToken(rawRefresh),
            UserAgent    = ctx.Request.Headers.UserAgent.ToString(),
            IpAddress    = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            KeepSignedIn = req.KeepSignedIn,
            ExpiresAt    = DateTime.UtcNow.AddDays(req.KeepSignedIn ? 7 : 1),
        };
        db.Sessions.Add(session);
        await db.SaveChangesAsync(ct);

        await sessions.AddAsync(user.Id, sessionId, ct);

        return Results.Ok(new AuthResponse(
            AccessToken:  jwt.GenerateAccessToken(user.Id, sessionId),
            RefreshToken: rawRefresh,
            User: new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl)));
    }

    // ── Login ──────────────────────────────────────────────────────────────────
    private static async Task<IResult> Login(
        LoginRequest req,
        AppDbContext db,
        IPasswordHasher hasher,
        IJwtTokenService jwt,
        ISessionStore sessions,
        HttpContext ctx,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return Results.BadRequest(new { error = "Email and password are required." });

        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Email == req.Email && u.DeletedAt == null, ct);

        // Sentinel forces full Argon2id computation even for unknown emails,
        // preventing timing side-channel user enumeration (~100ms path always runs).
        var hashToVerify = user?.PasswordHash ?? SentinelHash;
        var passwordValid = hasher.Verify(req.Password, hashToVerify);

        if (user is null || !passwordValid)
            return Results.Unauthorized();

        var rawRefresh = jwt.GenerateRawRefreshToken();
        var sessionId  = Guid.NewGuid();
        var session = new Session
        {
            Id           = sessionId,
            UserId       = user.Id,
            RefreshToken = jwt.HashRefreshToken(rawRefresh),
            UserAgent    = ctx.Request.Headers.UserAgent.ToString(),
            IpAddress    = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            KeepSignedIn = req.KeepSignedIn,
            ExpiresAt    = DateTime.UtcNow.AddDays(req.KeepSignedIn ? 7 : 1),
        };
        db.Sessions.Add(session);
        await db.SaveChangesAsync(ct);
        await sessions.AddAsync(user.Id, sessionId, ct);

        return Results.Ok(new AuthResponse(
            AccessToken:  jwt.GenerateAccessToken(user.Id, sessionId),
            RefreshToken: rawRefresh,
            User: new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl)));
    }

    // ── Logout ─────────────────────────────────────────────────────────────────
    private static async Task<IResult> Logout(
        ClaimsPrincipal principal,
        ISessionStore sessions,
        CancellationToken ct)
    {
        var userId    = Guid.Parse(principal.FindFirstValue("user_id")!);
        var sessionId = Guid.Parse(principal.FindFirstValue("session_id")!);
        await sessions.RevokeAsync(userId, sessionId, ct);
        return Results.NoContent();
    }

    // ── Refresh ────────────────────────────────────────────────────────────────
    private static async Task<IResult> Refresh(
        RefreshRequest req,
        AppDbContext db,
        IJwtTokenService jwt,
        ISessionStore sessions,
        HttpContext ctx,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.RefreshToken))
            return Results.BadRequest(new { error = "Refresh token is required." });

        var tokenHash = jwt.HashRefreshToken(req.RefreshToken);
        var session   = await db.Sessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshToken == tokenHash
                                   && s.RevokedAt == null
                                   && s.ExpiresAt > DateTime.UtcNow, ct);

        if (session is null)
            return Results.Unauthorized();

        await sessions.RevokeAsync(session.UserId, session.Id, ct);

        var rawRefresh   = jwt.GenerateRawRefreshToken();
        var newSessionId = Guid.NewGuid();
        var newSession = new Session
        {
            Id           = newSessionId,
            UserId       = session.UserId,
            RefreshToken = jwt.HashRefreshToken(rawRefresh),
            UserAgent    = ctx.Request.Headers.UserAgent.ToString(),
            IpAddress    = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            KeepSignedIn = session.KeepSignedIn,
            ExpiresAt    = DateTime.UtcNow.AddDays(session.KeepSignedIn ? 7 : 1),
        };
        db.Sessions.Add(newSession);
        await db.SaveChangesAsync(ct);
        await sessions.AddAsync(session.UserId, newSessionId, ct);

        var user = session.User;
        return Results.Ok(new AuthResponse(
            AccessToken:  jwt.GenerateAccessToken(session.UserId, newSessionId),
            RefreshToken: rawRefresh,
            User: new UserDto(user.Id, user.Username, user.Email, user.AvatarUrl)));
    }

    // ── Forgot Password ────────────────────────────────────────────────────────
    private static async Task<IResult> ForgotPassword(
        ForgotPasswordRequest req,
        AppDbContext db,
        IJwtTokenService jwt,
        IEmailSender email,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Email))
            return Results.BadRequest(new { error = "Email is required." });

        // Always return 200 to prevent user enumeration
        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Email == req.Email && u.DeletedAt == null, ct);

        if (user is not null)
        {
            var rawToken  = jwt.GenerateRawRefreshToken();
            var resetToken = new PasswordResetToken
            {
                UserId    = user.Id,
                TokenHash = jwt.HashRefreshToken(rawToken),
            };
            db.PasswordResetTokens.Add(resetToken);
            await db.SaveChangesAsync(ct);
            await email.SendResetEmailAsync(user.Email, rawToken, ct);
        }

        return Results.Ok(new { message = "If that email exists, a reset link has been sent." });
    }

    // ── Reset Password ─────────────────────────────────────────────────────────
    private static async Task<IResult> ResetPassword(
        ResetPasswordRequest req,
        AppDbContext db,
        IPasswordHasher hasher,
        IJwtTokenService jwt,
        ISessionStore sessions,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Token) || string.IsNullOrWhiteSpace(req.NewPassword))
            return Results.BadRequest(new { error = "Token and new password are required." });
        if (req.NewPassword.Length < 8)
            return Results.BadRequest(new { error = "Password must be at least 8 characters." });

        var tokenHash  = jwt.HashRefreshToken(req.Token);
        var resetToken = await db.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash
                                   && t.UsedAt == null
                                   && t.ExpiresAt > DateTime.UtcNow, ct);

        if (resetToken is null)
            return Results.BadRequest(new { error = "Token is invalid or has expired." });

        resetToken.User.PasswordHash = hasher.Hash(req.NewPassword);
        resetToken.UsedAt            = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await sessions.RevokeAllAsync(resetToken.UserId, ct: ct);

        return Results.Ok(new { message = "Password reset successfully." });
    }

    // ── Change Password ────────────────────────────────────────────────────────
    private static async Task<IResult> ChangePassword(
        ChangePasswordRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        IPasswordHasher hasher,
        ISessionStore sessions,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.CurrentPassword) || string.IsNullOrWhiteSpace(req.NewPassword))
            return Results.BadRequest(new { error = "Current and new password are required." });
        if (req.NewPassword.Length < 8)
            return Results.BadRequest(new { error = "New password must be at least 8 characters." });

        var userId    = Guid.Parse(principal.FindFirstValue("user_id")!);
        var sessionId = Guid.Parse(principal.FindFirstValue("session_id")!);

        var user = await db.Users.FindAsync([userId], ct);
        if (user is null) return Results.NotFound();

        if (!hasher.Verify(req.CurrentPassword, user.PasswordHash))
            return Results.BadRequest(new { error = "Current password is incorrect." });

        user.PasswordHash = hasher.Hash(req.NewPassword);
        await db.SaveChangesAsync(ct);

        await sessions.RevokeAllAsync(userId, exceptSessionId: sessionId, ct);

        return Results.Ok(new { message = "Password changed successfully." });
    }

    // ── Delete Account ─────────────────────────────────────────────────────────
    private static async Task<IResult> DeleteAccount(
        ClaimsPrincipal principal,
        AppDbContext db,
        ISessionStore sessions,
        CancellationToken ct)
    {
        var userId = Guid.Parse(principal.FindFirstValue("user_id")!);

        var user = await db.Users.FindAsync([userId], ct);
        if (user is null) return Results.NotFound();

        // Remove non-owned room memberships
        await db.RoomMemberships
            .Where(m => m.UserId == userId)
            .ExecuteDeleteAsync(ct);

        // Remove social graph
        await db.FriendRequests
            .Where(r => r.SenderId == userId || r.ReceiverId == userId)
            .ExecuteDeleteAsync(ct);
        await db.Friendships
            .Where(f => f.User1Id == userId || f.User2Id == userId)
            .ExecuteDeleteAsync(ct);
        await db.UserBlocks
            .Where(b => b.BlockerId == userId || b.BlockedUserId == userId)
            .ExecuteDeleteAsync(ct);

        // Soft-delete preserves email + username to prevent re-registration (AGENT.md §6)
        user.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await sessions.RevokeAllAsync(userId, ct: ct);

        return Results.NoContent();
    }
}
