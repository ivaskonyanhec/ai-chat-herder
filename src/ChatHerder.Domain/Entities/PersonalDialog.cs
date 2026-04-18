namespace ChatHerder.Domain.Entities;

// Application layer MUST enforce User1Id < User2Id (ordinal string comparison) before INSERT.
public sealed class PersonalDialog
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid User1Id { get; init; }  // always the smaller Guid
    public required Guid User2Id { get; init; }  // always the larger Guid
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? FrozenAt { get; set; }      // set when either user blocks the other

    public User User1 { get; init; } = null!;
    public User User2 { get; init; } = null!;
}
