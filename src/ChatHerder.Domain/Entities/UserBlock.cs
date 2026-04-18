namespace ChatHerder.Domain.Entities;

public sealed class UserBlock
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid BlockerId { get; init; }
    public required Guid BlockedUserId { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public User Blocker { get; init; } = null!;
    public User BlockedUser { get; init; } = null!;
}
