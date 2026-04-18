namespace ChatHerder.Infrastructure.Security;

public sealed record JwtSettings
{
    public required string SecretKey { get; init; }
    public required string Issuer { get; init; }
    public required string Audience { get; init; }
    public int AccessTokenMinutes { get; init; } = 15;
}
