using ChatHerder.Application.DTOs;

namespace ChatHerder.Application.Ports;

public interface IActivityLogger
{
    Task LogAsync(ActivityEvent evt, CancellationToken ct = default);
}
