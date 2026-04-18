using ChatHerder.Application.Ports;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ChatHerder.Infrastructure.Services;

// Ghost-cleanup safety net. Runs every 20s, removes stale tabs (no heartbeat in >70s).
// Primary AFK transitions happen via hub methods; this is the fallback sweeper.
public sealed class PresenceMonitorService(
    IPresenceStore presence,
    ILogger<PresenceMonitorService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(20);
    private const double StaleSeconds = 70;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(Interval, stoppingToken);
            await SweepAsync(stoppingToken);
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        try
        {
            var activeUsers = await presence.GetActiveUsersAsync(ct);
            var threshold   = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - StaleSeconds;

            foreach (var userId in activeUsers)
            {
                var stale = await presence.GetStaleTabsAsync(userId, threshold, ct);
                foreach (var (connId, _) in stale)
                    await presence.RemoveStaleTabAsync(userId, connId, ct);

                var remaining = await presence.GetTabCountAsync(userId, ct);
                if (remaining == 0)
                {
                    await presence.SetStatusAsync(userId, "offline", ct);
                    await presence.RemoveFromActiveUsersAsync(userId, ct);
                    logger.LogDebug("Swept offline: {UserId}", userId);
                }
                else if (await presence.IsAllTabsAfkAsync(userId, ct))
                {
                    var current = await presence.GetStatusAsync(userId, ct);
                    if (current != "afk")
                    {
                        await presence.SetStatusAsync(userId, "afk", ct);
                        logger.LogDebug("Swept afk: {UserId}", userId);
                    }
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "PresenceMonitorService sweep error");
        }
    }
}
