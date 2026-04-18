using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Services;
using Microsoft.Extensions.Logging;
using NSubstitute;

namespace ChatHerder.Unit.Tests.Services;

public sealed class PresenceMonitorServiceTests
{
    [Fact]
    public async Task SweepAsync_WhenNoActiveUsers_DoesNotCallGetTabCount()
    {
        var presence = Substitute.For<IPresenceStore>();
        presence.GetActiveUsersAsync(Arg.Any<CancellationToken>()).Returns([]);

        var logger = Substitute.For<ILogger<PresenceMonitorService>>();
        var svc = new PresenceMonitorService(presence, logger);

        await svc.SweepAsync(CancellationToken.None);

        await presence.DidNotReceive().GetTabCountAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SweepAsync_WhenAllTabsStale_SetsUserOffline()
    {
        var userId = Guid.NewGuid();
        var presence = Substitute.For<IPresenceStore>();
        presence.GetActiveUsersAsync(Arg.Any<CancellationToken>()).Returns([userId]);
        presence.GetStaleTabsAsync(userId, Arg.Any<double>(), Arg.Any<CancellationToken>())
            .Returns([("conn-1", 100.0)]);
        presence.GetTabCountAsync(userId, Arg.Any<CancellationToken>()).Returns(0L);

        var logger = Substitute.For<ILogger<PresenceMonitorService>>();
        var svc = new PresenceMonitorService(presence, logger);

        await svc.SweepAsync(CancellationToken.None);

        await presence.Received(1).SetStatusAsync(userId, "offline", Arg.Any<CancellationToken>());
        await presence.Received(1).RemoveFromActiveUsersAsync(userId, Arg.Any<CancellationToken>());
    }
}
