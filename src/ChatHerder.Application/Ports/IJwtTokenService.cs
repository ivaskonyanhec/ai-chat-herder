namespace ChatHerder.Application.Ports;

public interface IJwtTokenService
{
    /// <summary>Returns a signed JWT with claims user_id, session_id, jti. TTL = 15 min.</summary>
    string GenerateAccessToken(Guid userId, Guid sessionId);
    /// <summary>Returns a 64-byte cryptographically random raw token (store its SHA-256 hash).</summary>
    string GenerateRawRefreshToken();
    string HashRefreshToken(string rawToken);
}
