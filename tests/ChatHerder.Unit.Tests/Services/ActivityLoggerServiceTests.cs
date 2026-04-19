using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Application.Services;
using NSubstitute;

namespace ChatHerder.Unit.Tests.Services;

public sealed class ActivityLoggerServiceTests
{
    [Fact]
    public async Task LogAsync_PublishesWithCorrectRoutingKey()
    {
        var bus = Substitute.For<IMessageBus>();
        var sut = new ActivityLoggerService(bus);
        var evt = new ActivityEvent(
            UserId: Guid.NewGuid(),
            EventType: "user.connected",
            Payload: "{\"roomId\":\"abc\"}",
            IpAddress: "1.2.3.4",
            OccurredAt: DateTime.UtcNow);

        await sut.LogAsync(evt);

        await bus.Received(1).PublishAsync(
            "user.connected",
            evt,
            Arg.Any<CancellationToken>());
    }
}
