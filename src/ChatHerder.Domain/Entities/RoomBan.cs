namespace ChatHerder.Domain.Entities;

public sealed class RoomBan
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid UserId { get; init; }
    public required Guid BannedByUserId { get; init; }
    public required string Reason { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }

    public Room Room { get; init; } = null!;
    public User User { get; init; } = null!;
    public User BannedByUser { get; init; } = null!;
}
