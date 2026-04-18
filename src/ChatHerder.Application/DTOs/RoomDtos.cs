namespace ChatHerder.Application.DTOs;

public sealed record CreateRoomRequest(string Name, string? Description, string Visibility);
public sealed record UpdateRoomRequest(string? Name, string? Description, string? Visibility);

public sealed record RoomDto(
    Guid Id,
    string Name,
    string? Description,
    string Visibility,
    Guid OwnerId,
    DateTime CreatedAt,
    int MemberCount,
    string? CallerRole);        // "Owner"|"Admin"|"Member"|null (not a member)

public sealed record RoomMemberDto(
    Guid UserId,
    string Username,
    string? AvatarUrl,
    string Role,
    DateTime JoinedAt,
    string PresenceStatus);     // "online"|"afk"|"offline"

public sealed record RoomBanDto(
    Guid BannedUserId,
    string BannedUsername,
    Guid BannedByUserId,
    string BannedByUsername,
    string? Reason,
    DateTime CreatedAt);

public sealed record RoomInvitationDto(
    Guid Id,
    Guid RoomId,
    string RoomName,
    Guid InvitedByUserId,
    string InvitedByUsername,
    Guid InvitedUserId,
    string InvitedUsername,
    string Status,
    DateTime CreatedAt);

public sealed record BanMemberRequest(string? Reason);
public sealed record InviteUserRequest(string Username);
