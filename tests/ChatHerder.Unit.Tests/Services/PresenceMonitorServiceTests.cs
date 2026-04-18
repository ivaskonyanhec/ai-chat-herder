using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Services;
using Microsoft.Extensions.Logging;
using NSubstitute;

namespace ChatHerder.Unit.Tests.Services;

public sealed class PresenceMonitorServiceTests
{
    [Fact]
    public async Task ExecuteAsync_WhenNoActiveUsers_DoesNotCallGetTabCount()
    {
        var presence = Substitute.For<IPresenceStore>();
        presence.GetActiveUsersAsync(Arg.Any<CancellationToken>()).Returns([]);

        var logger = Substitute.For<ILogger<PresenceMonitorService>>();
        var svc = new PresenceMonitorService(presence, logger);

        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        try { await svc.StartAsync(cts.Token); } catch (OperationCanceledException) { }

        await presence.DidNotReceive().GetTabCountAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>());
    }
}
