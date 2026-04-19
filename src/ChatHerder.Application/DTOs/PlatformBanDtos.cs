namespace ChatHerder.Application.DTOs;

public sealed record IssuePlatformBanRequest(
    string Username,
    string Reason,
    int? DurationHours);   // null = permanent

public sealed record PlatformBanDto(
    Guid Id,
    Guid UserId,
    string Username,
    Guid IssuedByAdminId,
    string IssuedByAdminUsername,
    string Reason,
    DateTime CreatedAt,
    DateTime? ExpiresAt,
    DateTime? RevokedAt);
