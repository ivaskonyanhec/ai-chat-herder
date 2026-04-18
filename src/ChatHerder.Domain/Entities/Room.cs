using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

public sealed class Room
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; set; }
    public string? Description { get; set; }
    public required RoomVisibility Visibility { get; set; }
    public required Guid OwnerId { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }

    public User Owner { get; init; } = null!;
}
