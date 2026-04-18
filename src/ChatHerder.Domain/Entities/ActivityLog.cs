namespace ChatHerder.Domain.Entities;

public sealed class ActivityLog
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string EventType { get; init; }  // e.g. "message.sent", "user.banned"
    public required string Payload { get; init; }    // JSON string; stored as jsonb in PostgreSQL
    public Guid? UserId { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}
