using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;

namespace ChatHerder.Application.Services;

public sealed class ActivityLoggerService(IMessageBus bus) : IActivityLogger
{
    public Task LogAsync(ActivityEvent evt, CancellationToken ct = default) =>
        bus.PublishAsync(evt.EventType, evt, ct);
}
