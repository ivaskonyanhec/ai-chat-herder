using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ChatHerder.Application.Ports;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ChatHerder.Infrastructure.Security;

public sealed class JwtTokenService(IOptions<JwtSettings> settings) : IJwtTokenService
{
    public string GenerateAccessToken(Guid userId, Guid sessionId)
    {
        var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.Value.SecretKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim("user_id",    userId.ToString()),
            new Claim("session_id", sessionId.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var token = new JwtSecurityToken(
            issuer:             settings.Value.Issuer,
            audience:           settings.Value.Audience,
            claims:             claims,
            expires:            DateTime.UtcNow.AddMinutes(settings.Value.AccessTokenMinutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateRawRefreshToken()
        => Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));

    public string HashRefreshToken(string rawToken)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
}
