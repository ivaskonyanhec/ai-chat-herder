using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

public sealed class RoomMembership
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid UserId { get; init; }
    public required MemberRole Role { get; set; }
    public DateTime JoinedAt { get; init; } = DateTime.UtcNow;

    public Room Room { get; init; } = null!;
    public User User { get; init; } = null!;
}
