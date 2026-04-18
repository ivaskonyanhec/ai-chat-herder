namespace ChatHerder.Domain.Entities;

public sealed class Session
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid UserId { get; init; }
    public required string RefreshToken { get; init; } // opaque; stored hashed
    public required string UserAgent { get; init; }
    public required string IpAddress { get; init; }
    public bool KeepSignedIn { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public required DateTime ExpiresAt { get; init; } // 7 days (keepSignedIn) or 24 h
    public DateTime? RevokedAt { get; set; }

    public User User { get; init; } = null!;
}
