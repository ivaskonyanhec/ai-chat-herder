namespace ChatHerder.Domain.Entities;

public sealed class ReadMarker
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid UserId { get; init; }
    public required string ContextType { get; init; }   // "room" or "dialog" (lowercase)
    public required Guid ContextId { get; init; }
    public Guid? LastReadMessageId { get; set; }
    public DateTime LastReadAt { get; set; } = DateTime.UtcNow;

    public User User { get; init; } = null!;
}
