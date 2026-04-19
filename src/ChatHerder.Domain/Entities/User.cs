namespace ChatHerder.Domain.Entities;

public sealed class User
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Username { get; set; }
    public required string Email { get; set; }
    public required string PasswordHash { get; set; } // Argon2id encoded string
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }          // anonymized-delete; PII cleared, row kept for audit trail
}
