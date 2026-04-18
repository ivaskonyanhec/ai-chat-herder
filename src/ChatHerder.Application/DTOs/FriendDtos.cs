namespace ChatHerder.Application.DTOs;

public sealed record FriendRequestDto(
    Guid Id,
    Guid SenderId,
    string SenderUsername,
    string? SenderAvatarUrl,
    Guid ReceiverId,
    string ReceiverUsername,
    string? ReceiverAvatarUrl,
    string Status,
    string? Message,
    DateTime CreatedAt);

public sealed record FriendDto(
    Guid FriendshipId,
    Guid UserId,
    string Username,
    string? AvatarUrl,
    DateTime FriendSince);

public sealed record BlockDto(
    Guid BlockedUserId,
    string BlockedUsername,
    string? BlockedAvatarUrl,
    DateTime CreatedAt);

public sealed record DialogDto(
    Guid Id,
    Guid OtherUserId,
    string OtherUsername,
    string? OtherAvatarUrl,
    DateTime CreatedAt,
    bool IsFrozen);

public sealed record SendFriendRequestRequest(string Username, string? Message);
public sealed record BlockUserRequest(Guid UserId);
public sealed record CreateDialogRequest(Guid UserId);
public sealed record EditDmMessageRequest(string Content);
