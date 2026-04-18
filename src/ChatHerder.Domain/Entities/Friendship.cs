namespace ChatHerder.Domain.Entities;

// Application layer MUST enforce User1Id < User2Id before INSERT.
public sealed class Friendship
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid User1Id { get; init; }
    public required Guid User2Id { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public User User1 { get; init; } = null!;
    public User User2 { get; init; } = null!;
}
