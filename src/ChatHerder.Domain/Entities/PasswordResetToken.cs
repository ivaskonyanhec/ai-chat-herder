namespace ChatHerder.Domain.Entities;

public sealed class PasswordResetToken
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid UserId { get; init; }
    public required string TokenHash { get; init; }   // SHA-256 of the raw emailed token
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; init; } = DateTime.UtcNow.AddHours(1);
    public DateTime? UsedAt { get; set; }             // set on redemption; prevents reuse

    public User User { get; init; } = null!;
}
