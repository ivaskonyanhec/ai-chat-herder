using System.Text.Json.Nodes;

namespace ChatHerder.Application.DTOs;

public sealed record ActivityEvent(
    Guid UserId,
    string EventType,
    JsonNode Payload,
    string? IpAddress,
    DateTime OccurredAt);
