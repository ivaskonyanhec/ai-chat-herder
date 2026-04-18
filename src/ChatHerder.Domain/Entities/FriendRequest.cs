using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

public sealed class FriendRequest
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid SenderId { get; init; }
    public required Guid ReceiverId { get; init; }
    public FriendRequestStatus Status { get; set; } = FriendRequestStatus.Pending;
    public string? Message { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? RespondedAt { get; set; }

    public User Sender { get; init; } = null!;
    public User Receiver { get; init; } = null!;
}
