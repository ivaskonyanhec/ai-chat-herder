namespace ChatHerder.Application.DTOs;

public sealed record ActivityEvent(
    Guid UserId,
    string EventType,
    string Payload,
    string? IpAddress,
    DateTime OccurredAt);
