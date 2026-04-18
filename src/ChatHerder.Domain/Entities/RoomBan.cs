namespace ChatHerder.Domain.Entities;

public sealed class RoomBan
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid BannedUserId { get; init; }
    public required Guid BannedByUserId { get; init; }
    public string? Reason { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }
    public Guid? RevokedByUserId { get; set; }

    public Room Room { get; init; } = null!;
    public User BannedUser { get; init; } = null!;
    public User BannedByUser { get; init; } = null!;
}
