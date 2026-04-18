// Production AllowedHosts is set via the AllowedHosts env var (ASP.NET Core env-var
// config provider overrides appsettings.json). Docker Compose must set AllowedHosts=<domain>.
using ChatHerder.API.Middleware;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// SignalR — required by PresenceHub and ChatHub (AGENT.md §10)
builder.Services.AddSignalR();

// Authentication — JWT (AGENT.md §7); details wired in Phase 3
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();

// EF Core — reads connection string from config; never hardcoded (AGENT.md §3.3)
builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

var app = builder.Build();

// Run EF Core migrations on startup (AGENT.md §3.3)
using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

// Middleware pipeline — strict order per AGENT.md §5:
// UseAuthentication → BanCheckMiddleware → SessionValidationMiddleware → UseAuthorization
app.UseAuthentication();
app.UseMiddleware<BanCheckMiddleware>();
app.UseMiddleware<SessionValidationMiddleware>();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Health check — required by docker-compose healthcheck
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
   .AllowAnonymous();

app.Run();

// Exposed for WebApplicationFactory in integration tests
public partial class Program { }
