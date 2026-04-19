using ChatHerder.Application.DTOs;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using System.Text.Json;

namespace ChatHerder.Infrastructure.Services;

public sealed class ActivityConsumer(
    IServiceScopeFactory scopeFactory,
    IConfiguration config,
    ILogger<ActivityConsumer> logger) : BackgroundService
{
    private const string Exchange = "chat.events";
    private const string Queue = "activity.log";
    private const string BindingKey = "chat.events.#";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var uri = config["RabbitMQ:Uri"]
            ?? throw new InvalidOperationException("RabbitMQ:Uri is not configured.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunConsumerAsync(uri, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "ActivityConsumer: RabbitMQ connection lost, retrying in 5 s");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken).ConfigureAwait(false);
            }
        }
    }

    private async Task RunConsumerAsync(string uri, CancellationToken stoppingToken)
    {
        var factory = new ConnectionFactory { Uri = new Uri(uri) };
        await using var connection = await factory.CreateConnectionAsync(stoppingToken);
        var channel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);

        await channel.ExchangeDeclareAsync(Exchange, ExchangeType.Topic,
            durable: true, autoDelete: false, cancellationToken: stoppingToken);
        await channel.QueueDeclareAsync(Queue, durable: true, exclusive: false,
            autoDelete: false, cancellationToken: stoppingToken);
        await channel.QueueBindAsync(Queue, Exchange, BindingKey,
            cancellationToken: stoppingToken);
        await channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 10,
            global: false, cancellationToken: stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += async (_, ea) =>
        {
            try
            {
                var evt = JsonSerializer.Deserialize<ActivityEvent>(
                    ea.Body.Span, JsonSerializerOptions.Web);
                if (evt is null)
                {
                    await channel.BasicNackAsync(ea.DeliveryTag, false, false);
                    return;
                }
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await ProcessMessageAsync(db, evt, stoppingToken);
                await channel.BasicAckAsync(ea.DeliveryTag, false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Failed to process ActivityEvent");
                await channel.BasicNackAsync(ea.DeliveryTag, false, false);
            }
        };

        await channel.BasicConsumeAsync(Queue, autoAck: false, consumer: consumer,
            cancellationToken: stoppingToken);

        await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken).ConfigureAwait(false);
    }

    internal static async Task ProcessMessageAsync(
        AppDbContext db, ActivityEvent evt, CancellationToken ct)
    {
        var log = new Domain.Entities.ActivityLog
        {
            EventType = evt.EventType,
            Payload = evt.Payload,
            UserId = evt.UserId == Guid.Empty ? null : evt.UserId,
            CreatedAt = evt.OccurredAt,
        };
        db.ActivityLogs.Add(log);
        await db.SaveChangesAsync(ct);
    }
}
