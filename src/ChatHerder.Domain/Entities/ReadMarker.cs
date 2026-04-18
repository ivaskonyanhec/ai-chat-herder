using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

public sealed class ReadMarker
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid UserId { get; init; }
    public required ContextType ContextType { get; init; }
    public required Guid ContextId { get; init; }     // RoomId or DialogId
    public required long LastReadSequenceNumber { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; init; } = null!;
}
