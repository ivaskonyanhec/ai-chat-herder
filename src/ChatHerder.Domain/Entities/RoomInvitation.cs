using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

public sealed class RoomInvitation
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid InvitedUserId { get; init; }
    public required Guid InvitedByUserId { get; init; }
    public InvitationStatus Status { get; set; } = InvitationStatus.Pending;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? RespondedAt { get; set; }

    public Room Room { get; init; } = null!;
    public User InvitedUser { get; init; } = null!;
    public User InvitedByUser { get; init; } = null!;
}
