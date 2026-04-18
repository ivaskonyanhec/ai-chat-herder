namespace ChatHerder.Domain.Entities;

public sealed class PlatformBan
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid UserId { get; init; }
    public required Guid IssuedByAdminId { get; init; }
    public required string Reason { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; init; }  // null = permanent
    public DateTime? RevokedAt { get; set; }

    public User User { get; init; } = null!;
    public User IssuedByAdmin { get; init; } = null!;
}
