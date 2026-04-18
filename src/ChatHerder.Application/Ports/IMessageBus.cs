namespace ChatHerder.Application.Ports;

public interface IMessageBus
{
    /// <summary>
    /// Publishes a message to the RabbitMQ topic exchange "chat.events".
    /// Routing key examples: "message.sent", "user.banned", "user.connected".
    /// </summary>
    Task PublishAsync<T>(string routingKey, T message, CancellationToken ct = default)
        where T : notnull;
}
