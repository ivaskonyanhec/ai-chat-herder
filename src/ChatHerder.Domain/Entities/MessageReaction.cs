namespace ChatHerder.Domain.Entities;

public sealed class MessageReaction
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid MessageId { get; init; }
    public required Guid UserId { get; init; }
    public required string Emoji { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public Message Message { get; init; } = null!;
    public User User { get; init; } = null!;
}
