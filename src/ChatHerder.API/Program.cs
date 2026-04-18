// Production AllowedHosts is set via the AllowedHosts env var (ASP.NET Core env-var
// config provider overrides appsettings.json). Docker Compose must set AllowedHosts=<domain>.
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// SignalR — required by PresenceHub and ChatHub (AGENT.md §10)
builder.Services.AddSignalR();

// Authentication + Authorization — JWT details wired in Phase 2
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();

var app = builder.Build();

// Middleware pipeline — strict order per AGENT.md §5:
// UseAuthentication → BanCheckMiddleware → SessionValidationMiddleware → UseAuthorization
app.UseAuthentication();
app.UseMiddleware<ChatHerder.API.Middleware.BanCheckMiddleware>();
app.UseMiddleware<ChatHerder.API.Middleware.SessionValidationMiddleware>();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Health check — required by docker-compose healthcheck (docker-compose.yml line 68)
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
   .AllowAnonymous();

app.Run();

// Exposed for WebApplicationFactory in integration tests
public partial class Program { }
