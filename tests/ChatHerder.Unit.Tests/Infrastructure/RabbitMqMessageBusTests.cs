using ChatHerder.Application.DTOs;
using ChatHerder.Infrastructure.Messaging;
using System.Text.Json;

namespace ChatHerder.Unit.Tests.Infrastructure;

public sealed class RabbitMqMessageBusTests
{
    [Fact]
    public void SerializeMessage_ProducesValidJson()
    {
        var evt = new ActivityEvent(
            UserId: Guid.Parse("11111111-1111-1111-1111-111111111111"),
            EventType: "user.connected",
            Payload: "{\"key\":\"val\"}",
            IpAddress: "127.0.0.1",
            OccurredAt: new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        var bytes = RabbitMqMessageBus.SerializeMessage(evt);
        var json = JsonDocument.Parse(bytes).RootElement;

        Assert.Equal("user.connected", json.GetProperty("eventType").GetString());
        Assert.Equal("11111111-1111-1111-1111-111111111111",
            json.GetProperty("userId").GetString());
    }

    [Fact]
    public void SerializeMessage_AnonymousObject_ProducesValidJson()
    {
        var bytes = RabbitMqMessageBus.SerializeMessage(new { foo = "bar", count = 42 });
        var json = JsonDocument.Parse(bytes).RootElement;

        Assert.Equal("bar", json.GetProperty("foo").GetString());
        Assert.Equal(42, json.GetProperty("count").GetInt32());
    }
}
