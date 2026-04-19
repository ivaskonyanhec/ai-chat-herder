# Phase 4i — RabbitMQ MessageBus + ActivityConsumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `RabbitMqMessageBus` (implements `IMessageBus`) and `ActivityConsumer` (`BackgroundService`) so that activity events published to the `chat.events` RabbitMQ exchange are persisted as `ActivityLog` rows.

**Architecture:** Application layer defines `ActivityEvent` record and `IActivityLogger` port. Infrastructure provides `RabbitMqMessageBus` (publish) and `ActivityConsumer` (subscribe + persist). Both are singletons/hosted-services registered in `InfrastructureExtensions`.

**Tech Stack:** .NET 10 Minimal APIs, RabbitMQ.Client 7.2.1 (already in csproj), EF Core 10 + Npgsql, xUnit + NSubstitute, `System.Text.Json`.

---

## File Map

### Create
- `src/ChatHerder.Application/DTOs/ActivityDtos.cs` — `ActivityEvent` record (shared contract)
- `src/ChatHerder.Application/Ports/IActivityLogger.cs` — port interface used by callsites
- `src/ChatHerder.Application/Services/ActivityLoggerService.cs` — `IActivityLogger` impl using `IMessageBus`
- `src/ChatHerder.Infrastructure/Messaging/RabbitMqMessageBus.cs` — `IMessageBus` + `IAsyncDisposable`
- `src/ChatHerder.Infrastructure/Services/ActivityConsumer.cs` — `BackgroundService` consumer
- `tests/ChatHerder.Unit.Tests/Infrastructure/RabbitMqMessageBusTests.cs`
- `tests/ChatHerder.Unit.Tests/Services/ActivityLoggerServiceTests.cs`
- `tests/ChatHerder.Unit.Tests/Services/ActivityConsumerTests.cs`

### Modify
- `src/ChatHerder.Infrastructure/InfrastructureExtensions.cs` — register `RabbitMqMessageBus` + `ActivityLoggerService` + `ActivityConsumer`
- `src/ChatHerder.API/appsettings.json` — add `RabbitMQ` section
- `DEVELOPMENT_LOG.md` — Phase 4i task entries with `[Cloned agent 2]`

---

## Task 1: ActivityEvent record + IActivityLogger port

**Files:**
- Create: `src/ChatHerder.Application/DTOs/ActivityDtos.cs`
- Create: `src/ChatHerder.Application/Ports/IActivityLogger.cs`

- [ ] **Step 1: Write the failing test**

```csharp
// tests/ChatHerder.Unit.Tests/Services/ActivityLoggerServiceTests.cs
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Application.Services;
using NSubstitute;
using System.Text.Json.Nodes;

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
            Payload: JsonNode.Parse("{\"roomId\":\"abc\"}")!,
            IpAddress: "1.2.3.4",
            OccurredAt: DateTime.UtcNow);

        await sut.LogAsync(evt);

        await bus.Received(1).PublishAsync(
            "user.connected",
            Arg.Is<ActivityEvent>(e => e.UserId == evt.UserId),
            Arg.Any<CancellationToken>());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ --filter "ActivityLoggerServiceTests" -v q
```
Expected: compile error — `ActivityEvent`, `IActivityLogger`, `ActivityLoggerService` do not exist.

- [ ] **Step 3: Create ActivityEvent record**

Create `src/ChatHerder.Application/DTOs/ActivityDtos.cs`:
```csharp
using System.Text.Json.Nodes;

namespace ChatHerder.Application.DTOs;

public sealed record ActivityEvent(
    Guid UserId,
    string EventType,
    JsonNode Payload,
    string? IpAddress,
    DateTime OccurredAt);
```

- [ ] **Step 4: Create IActivityLogger port**

Create `src/ChatHerder.Application/Ports/IActivityLogger.cs`:
```csharp
using ChatHerder.Application.DTOs;

namespace ChatHerder.Application.Ports;

public interface IActivityLogger
{
    Task LogAsync(ActivityEvent evt, CancellationToken ct = default);
}
```

- [ ] **Step 5: Create ActivityLoggerService**

Create `src/ChatHerder.Application/Services/ActivityLoggerService.cs`:
```csharp
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;

namespace ChatHerder.Application.Services;

public sealed class ActivityLoggerService(IMessageBus bus) : IActivityLogger
{
    public Task LogAsync(ActivityEvent evt, CancellationToken ct = default) =>
        bus.PublishAsync(evt.EventType, evt, ct);
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "ActivityLoggerServiceTests" -v q
```
Expected: 1 test PASSED.

- [ ] **Step 7: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add src/ChatHerder.Application/DTOs/ActivityDtos.cs \
        src/ChatHerder.Application/Ports/IActivityLogger.cs \
        src/ChatHerder.Application/Services/ActivityLoggerService.cs \
        tests/ChatHerder.Unit.Tests/Services/ActivityLoggerServiceTests.cs
git commit -m "feat: ActivityEvent DTO, IActivityLogger port, ActivityLoggerService [Cloned agent 2]"
```

---

## Task 2: RabbitMqMessageBus

**Files:**
- Create: `src/ChatHerder.Infrastructure/Messaging/RabbitMqMessageBus.cs`
- Create: `tests/ChatHerder.Unit.Tests/Infrastructure/RabbitMqMessageBusTests.cs`

The bus uses a lazy singleton connection. Testability is achieved via an `internal static SerializeMessage<T>` helper that can be tested in isolation. The actual AMQP publish path is integration-only.

- [ ] **Step 1: Write the failing test**

```csharp
// tests/ChatHerder.Unit.Tests/Infrastructure/RabbitMqMessageBusTests.cs
using ChatHerder.Application.DTOs;
using ChatHerder.Infrastructure.Messaging;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ChatHerder.Unit.Tests.Infrastructure;

public sealed class RabbitMqMessageBusTests
{
    [Fact]
    public void SerializeMessage_ProducesValidJson()
    {
        var evt = new ActivityEvent(
            UserId: Guid.Parse("11111111-1111-1111-1111-111111111111"),
            EventType: "user.connected",
            Payload: JsonNode.Parse("{\"key\":\"val\"}")!,
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "RabbitMqMessageBusTests" -v q
```
Expected: compile error — `RabbitMqMessageBus` does not exist.

- [ ] **Step 3: Create RabbitMqMessageBus**

Create `src/ChatHerder.Infrastructure/Messaging/RabbitMqMessageBus.cs`:
```csharp
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "RabbitMqMessageBusTests" -v q
```
Expected: 2 tests PASSED.

- [ ] **Step 5: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add src/ChatHerder.Infrastructure/Messaging/RabbitMqMessageBus.cs \
        tests/ChatHerder.Unit.Tests/Infrastructure/RabbitMqMessageBusTests.cs
git commit -m "feat: RabbitMqMessageBus — IMessageBus impl with lazy AMQP connection [Cloned agent 2]"
```

---

## Task 3: ActivityConsumer IHostedService

**Files:**
- Create: `src/ChatHerder.Infrastructure/Services/ActivityConsumer.cs`
- Create: `tests/ChatHerder.Unit.Tests/Services/ActivityConsumerTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
// tests/ChatHerder.Unit.Tests/Services/ActivityConsumerTests.cs
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using ChatHerder.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Nodes;

namespace ChatHerder.Unit.Tests.Services;

public sealed class ActivityConsumerTests
{
    private static AppDbContext BuildContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Fact]
    public async Task ProcessMessageAsync_InsertsActivityLog()
    {
        await using var db = BuildContext();
        var userId = Guid.NewGuid();
        var evt = new ActivityEvent(
            UserId: userId,
            EventType: "message.sent",
            Payload: JsonNode.Parse("{\"roomId\":\"abc\"}")!,
            IpAddress: "10.0.0.1",
            OccurredAt: new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc));

        await ActivityConsumer.ProcessMessageAsync(db, evt, CancellationToken.None);

        var log = await db.ActivityLogs.SingleAsync();
        Assert.Equal("message.sent", log.EventType);
        Assert.Equal(userId, log.UserId);
        Assert.Contains("roomId", log.Payload);
        Assert.Equal(new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc), log.CreatedAt);
    }

    [Fact]
    public async Task ProcessMessageAsync_NullUserId_StillInserts()
    {
        await using var db = BuildContext();
        var evt = new ActivityEvent(
            UserId: Guid.Empty,
            EventType: "user.registered",
            Payload: JsonNode.Parse("{}")!,
            IpAddress: null,
            OccurredAt: DateTime.UtcNow);

        await ActivityConsumer.ProcessMessageAsync(db, evt, CancellationToken.None);

        Assert.Single(await db.ActivityLogs.ToListAsync());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "ActivityConsumerTests" -v q
```
Expected: compile error — `ActivityConsumer` does not exist.

- [ ] **Step 3: Check that ActivityLogs DbSet exists on AppDbContext**

```bash
grep -n "ActivityLog" /Users/igorvaskonyan/projects/ai/ai-chat-herder/src/ChatHerder.Infrastructure/Persistence/AppDbContext.cs
```
Expected: line with `DbSet<ActivityLog> ActivityLogs`. If missing, add `public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();` to `AppDbContext.cs` before proceeding.

- [ ] **Step 4: Create ActivityConsumer**

Create `src/ChatHerder.Infrastructure/Services/ActivityConsumer.cs`:
```csharp
using ChatHerder.Application.DTOs;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
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
            catch (Exception ex)
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
            Payload = evt.Payload.ToJsonString(),
            UserId = evt.UserId == Guid.Empty ? null : evt.UserId,
            CreatedAt = evt.OccurredAt,
        };
        db.ActivityLogs.Add(log);
        await db.SaveChangesAsync(ct);
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ --filter "ActivityConsumerTests" -v q
```
Expected: 2 tests PASSED.

- [ ] **Step 6: Run full test suite**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ -v q
```
Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add src/ChatHerder.Infrastructure/Services/ActivityConsumer.cs \
        tests/ChatHerder.Unit.Tests/Services/ActivityConsumerTests.cs
git commit -m "feat: ActivityConsumer BackgroundService — AMQP subscribe, persist ActivityLogs [Cloned agent 2]"
```

---

## Task 4: DI wiring + appsettings

**Files:**
- Modify: `src/ChatHerder.Infrastructure/InfrastructureExtensions.cs`
- Modify: `src/ChatHerder.API/appsettings.json`

- [ ] **Step 1: Add RabbitMQ section to appsettings.json**

In `src/ChatHerder.API/appsettings.json`, add after the `"Smtp"` block:
```json
  "RabbitMQ": {
    "Uri": "amqp://guest:guest@localhost:5672/"
  }
```

The final file should look like:
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "localhost",
  "ConnectionStrings": {
    "Default": "Host=postgres;Port=5432;Database=chatherder;Username=chatuser;Password=REPLACE_VIA_ENV"
  },
  "Redis": {
    "ConnectionString": "redis:6379,password=REPLACE_VIA_ENV"
  },
  "Jwt": {
    "SecretKey": "REPLACE_VIA_ENV",
    "Issuer": "http://localhost",
    "Audience": "http://localhost",
    "AccessTokenMinutes": 15
  },
  "Storage": {
    "BasePath": "/app/uploads"
  },
  "Smtp": {
    "Port": 587
  },
  "RabbitMQ": {
    "Uri": "amqp://guest:guest@localhost:5672/"
  }
}
```

- [ ] **Step 2: Register services in InfrastructureExtensions**

Read `src/ChatHerder.Infrastructure/InfrastructureExtensions.cs` (current content is known — it ends with `services.AddHostedService<OrphanCleanupService>();`).

Add these registrations after the `OrphanCleanupService` line:
```csharp
services.AddSingleton<RabbitMqMessageBus>();
services.AddSingleton<IMessageBus>(sp => sp.GetRequiredService<RabbitMqMessageBus>());
services.AddScoped<IActivityLogger, ActivityLoggerService>();
services.AddHostedService<ActivityConsumer>();
```

The full updated `AddInfrastructure` method:
```csharp
using ChatHerder.Application.Ports;
using ChatHerder.Application.Services;
using ChatHerder.Infrastructure.Cache;
using ChatHerder.Infrastructure.Email;
using ChatHerder.Infrastructure.Messaging;
using ChatHerder.Infrastructure.Persistence;
using ChatHerder.Infrastructure.Security;
using ChatHerder.Infrastructure.Services;
using ChatHerder.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;

namespace ChatHerder.Infrastructure;

public static class InfrastructureExtensions
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration config)
    {
        // EF Core
        services.AddDbContext<AppDbContext>(opts =>
            opts.UseNpgsql(config.GetConnectionString("Default")));

        // Redis — singleton; thread-safe multiplexer
        services.AddSingleton<IConnectionMultiplexer>(_ =>
            ConnectionMultiplexer.Connect(config["Redis:ConnectionString"]
                ?? throw new InvalidOperationException("Redis:ConnectionString is not configured.")));

        // JWT settings
        services.Configure<JwtSettings>(config.GetSection("Jwt"));

        // Infrastructure service registrations
        services.AddScoped<IPasswordHasher, ArgonPasswordHasher>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<ISessionStore, RedisSessionStore>();
        services.AddScoped<IEmailSender, SmtpEmailSender>();

        services.AddSingleton<IPresenceStore, RedisPresenceStore>();
        services.AddSingleton<IUnreadStore, RedisUnreadStore>();
        services.AddHostedService<PresenceMonitorService>();

        services.AddSingleton<IFileStorage, LocalFileStorage>();
        services.AddHostedService<OrphanCleanupService>();

        // RabbitMQ — message bus + activity consumer
        services.AddSingleton<RabbitMqMessageBus>();
        services.AddSingleton<IMessageBus>(sp => sp.GetRequiredService<RabbitMqMessageBus>());
        services.AddScoped<IActivityLogger, ActivityLoggerService>();
        services.AddHostedService<ActivityConsumer>();

        return services;
    }
}
```

- [ ] **Step 3: Verify the project builds**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet build src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj -v q
dotnet build src/ChatHerder.API/ChatHerder.API.csproj -v q
```
Expected: both build with 0 errors.

- [ ] **Step 4: Run full unit test suite**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ -v q
```
Expected: all tests pass (should be 82+ tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add src/ChatHerder.Infrastructure/InfrastructureExtensions.cs \
        src/ChatHerder.API/appsettings.json
git commit -m "feat: wire RabbitMqMessageBus, ActivityLoggerService, ActivityConsumer in DI [Cloned agent 2]"
```

---

## Task 5: DEVELOPMENT_LOG.md

**Files:**
- Modify: `DEVELOPMENT_LOG.md`

- [ ] **Step 1: Read last entry to get task number**

```bash
grep -n "^## T" /Users/igorvaskonyan/projects/ai/ai-chat-herder/DEVELOPMENT_LOG.md | tail -5
```
Note the last `T{N}` number. Phase 4h used up to T130 (verify actual number). Next task is last+1.

- [ ] **Step 2: Append Phase 4i entries**

Append to `DEVELOPMENT_LOG.md` using the project's log format (one entry per task). Use the next sequential task numbers. Each entry must include `[Cloned agent 2]`. Example block (adjust T-numbers to match actual last entry + 1):

```markdown
## T127 [Cloned agent 2] feat: ActivityEvent DTO + IActivityLogger port + ActivityLoggerService
- Created `src/ChatHerder.Application/DTOs/ActivityDtos.cs` — `ActivityEvent` record (UserId, EventType, Payload, IpAddress, OccurredAt)
- Created `src/ChatHerder.Application/Ports/IActivityLogger.cs` — `LogAsync(ActivityEvent)` port
- Created `src/ChatHerder.Application/Services/ActivityLoggerService.cs` — delegates to `IMessageBus.PublishAsync(evt.EventType, evt)`
- Added `ActivityLoggerServiceTests` (1 test)

## T128 [Cloned agent 2] feat: RabbitMqMessageBus — IMessageBus impl
- Created `src/ChatHerder.Infrastructure/Messaging/RabbitMqMessageBus.cs`
- Lazy singleton AMQP connection; declares exchange `chat.events` (topic, durable) on first publish
- `SerializeMessage<T>` internal static helper tested in isolation
- Added `RabbitMqMessageBusTests` (2 tests)

## T129 [Cloned agent 2] feat: ActivityConsumer BackgroundService
- Created `src/ChatHerder.Infrastructure/Services/ActivityConsumer.cs`
- Subscribes to queue `activity.log` bound to `chat.events.#`; prefetch 10; manual ack
- `ProcessMessageAsync` internal static — maps `ActivityEvent` → `ActivityLog` row
- Added `ActivityConsumerTests` (2 tests)

## T130 [Cloned agent 2] feat: DI wiring + appsettings for RabbitMQ
- Registered `RabbitMqMessageBus` as singleton, `IMessageBus` aliased to it
- Registered `IActivityLogger` → `ActivityLoggerService` (scoped), `ActivityConsumer` as hosted service
- Added `RabbitMQ:Uri` placeholder to `appsettings.json`
```

- [ ] **Step 3: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add DEVELOPMENT_LOG.md
git commit -m "docs: DEVELOPMENT_LOG Phase 4i entries T127-T130 [Cloned agent 2]"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `IMessageBus` already existed — used, not re-created
- [x] `ActivityEvent` record with all 5 fields from spec
- [x] `IActivityLogger` port in Application/Ports
- [x] `RabbitMqMessageBus` → exchange `chat.events`, topic, durable
- [x] `ActivityConsumer` → queue `activity.log`, binding `chat.events.#`, inserts `ActivityLogs`
- [x] Both registered in `InfrastructureExtensions`
- [x] `RabbitMQ:Uri` in appsettings

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" references. All code is complete.

**Type consistency:**
- `ActivityEvent` record defined in Task 1, used identically in Tasks 2, 3, 4
- `ProcessMessageAsync(AppDbContext, ActivityEvent, CancellationToken)` defined and tested in Task 3
- `SerializeMessage<T>` defined and tested in Task 2
- `IActivityLogger.LogAsync(ActivityEvent, CancellationToken)` defined in Task 1, implemented in same task

**Potential gap:** Task 3 Step 3 checks whether `AppDbContext.ActivityLogs` DbSet exists. If it doesn't, the implementer must add it before the test can pass — this is explicitly called out.
