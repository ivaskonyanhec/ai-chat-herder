namespace ChatHerder.Application.DTOs;

public sealed record RegisterRequest(string Username, string Email, string Password, bool KeepSignedIn);
public sealed record LoginRequest(string Email, string Password, bool KeepSignedIn);
public sealed record RefreshRequest(string? RefreshToken);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Token, string NewPassword);

public sealed record UserDto(Guid Id, string Username, string Email, string? AvatarUrl);

public sealed record UserSearchResultDto(Guid Id, string Username, string? AvatarUrl);
public sealed record AuthResponse(string AccessToken, string RefreshToken, UserDto User);
public sealed record SessionDto(Guid Id, string UserAgent, string IpAddress, bool KeepSignedIn,
    DateTime CreatedAt, DateTime ExpiresAt, bool IsCurrent);
