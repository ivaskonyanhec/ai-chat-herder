using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ChatHerder.Infrastructure.Services;

public sealed class OrphanCleanupService(
    IServiceScopeFactory scopeFactory,
    ILogger<OrphanCleanupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope   = scopeFactory.CreateScope();
                var db            = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var storage       = scope.ServiceProvider.GetRequiredService<IFileStorage>();
                await RunCleanupCoreAsync(db, storage, logger, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "OrphanCleanupService sweep failed");
            }
            await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
        }
    }

    internal static async Task RunCleanupCoreAsync(
        AppDbContext db, IFileStorage storage, ILogger logger, CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddHours(-24);
        var orphans = await db.Attachments
            .Where(a => a.MessageId == null
                     && a.PersonalDialogMessageId == null
                     && a.UploadedAt < cutoff)
            .ToListAsync(ct);

        foreach (var orphan in orphans)
        {
            try
            {
                await storage.DeleteAsync(orphan.StoragePath, ct);
                db.Attachments.Remove(orphan);
                logger.LogInformation("Deleted orphan attachment {Id}", orphan.Id);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to delete orphan attachment {Id}", orphan.Id);
            }
        }
        await db.SaveChangesAsync(ct);
    }
}
