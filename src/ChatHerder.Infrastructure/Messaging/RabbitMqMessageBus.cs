using ChatHerder.Application.Ports;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using RabbitMQ.Client;
using System.Text.Json;

namespace ChatHerder.Infrastructure.Messaging;

public sealed class RabbitMqMessageBus(
    IConfiguration config,
    ILogger<RabbitMqMessageBus> logger) : IMessageBus, IAsyncDisposable
{
    private const string Exchange = "chat.events";

    private readonly SemaphoreSlim _lock = new(1, 1);
    private IConnection? _connection;
    private IChannel? _channel;

    public async Task PublishAsync<T>(string routingKey, T message, CancellationToken ct = default)
        where T : notnull
    {
        var channel = await GetChannelAsync(ct);
        var body = SerializeMessage(message);
        var props = new BasicProperties
        {
            DeliveryMode = DeliveryModes.Persistent,
            ContentType = "application/json",
        };
        await channel.BasicPublishAsync(Exchange, routingKey, false, props,
            new ReadOnlyMemory<byte>(body), ct);
        logger.LogDebug("Published {RoutingKey} to {Exchange}", routingKey, Exchange);
    }

    internal static byte[] SerializeMessage<T>(T message) =>
        JsonSerializer.SerializeToUtf8Bytes(message, JsonSerializerOptions.Web);

    private async Task<IChannel> GetChannelAsync(CancellationToken ct)
    {
        if (_channel is { IsOpen: true }) return _channel;

        await _lock.WaitAsync(ct);
        try
        {
            if (_channel is { IsOpen: true }) return _channel;

            var uri = config["RabbitMQ:Uri"]
                ?? throw new InvalidOperationException("RabbitMQ:Uri is not configured.");
            var factory = new ConnectionFactory { Uri = new Uri(uri) };
            _connection = await factory.CreateConnectionAsync(ct);
            _channel = await _connection.CreateChannelAsync(cancellationToken: ct);
            await _channel.ExchangeDeclareAsync(Exchange, ExchangeType.Topic,
                durable: true, autoDelete: false, cancellationToken: ct);
            return _channel;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_channel is not null) await _channel.CloseAsync();
        if (_connection is not null) await _connection.CloseAsync();
    }
}
