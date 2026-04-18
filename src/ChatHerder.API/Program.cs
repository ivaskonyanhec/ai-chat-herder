// Production AllowedHosts is set via the AllowedHosts env var (ASP.NET Core env-var
// config provider overrides appsettings.json). Docker Compose must set AllowedHosts=<domain>.
using System.Text;
using ChatHerder.API.Endpoints;
using ChatHerder.API.Middleware;
using ChatHerder.Infrastructure;
using ChatHerder.Infrastructure.Persistence;
using ChatHerder.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();

// Infrastructure (EF Core, Redis, Argon2id, JWT service, email)
builder.Services.AddInfrastructure(builder.Configuration);

// JWT Bearer authentication (AGENT.md §7)
var jwtSettings = builder.Configuration.GetSection("Jwt").Get<JwtSettings>()
    ?? throw new InvalidOperationException("Jwt configuration section is missing.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts =>
    {
        opts.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = jwtSettings.Issuer,
            ValidAudience            = jwtSettings.Audience,
            IssuerSigningKey         = new SymmetricSecurityKey(
                                           Encoding.UTF8.GetBytes(jwtSettings.SecretKey)),
            ClockSkew = TimeSpan.Zero, // exact 15-min expiry; no grace period
        };
        // WebSocket / SignalR: token arrives as ?access_token= query string (AGENT.md §3.4)
        opts.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"].ToString();
                if (!string.IsNullOrEmpty(token) &&
                    ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                {
                    ctx.Token = token;
                }
                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

// Run EF Core migrations on startup (AGENT.md §3.3)
using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

// Middleware pipeline — strict order per AGENT.md §5
app.UseAuthentication();
app.UseMiddleware<BanCheckMiddleware>();
app.UseMiddleware<SessionValidationMiddleware>();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
   .AllowAnonymous();

// Endpoint groups
var api = app.MapGroup("/api");
api.MapGroup("/auth").MapAuthEndpoints();
api.MapGroup("/sessions").MapSessionsEndpoints();
api.MapGroup("/users").MapUserEndpoints();
api.MapGroup("/rooms").MapRoomEndpoints();
api.MapGroup("").MapRoomInvitationEndpoints();   // mounts /rooms/{id}/invitations and /invitations at /api
api.MapGroup("/messages").MapMessageEndpoints();
api.MapGroup("").MapNotificationEndpoints();     // mounts /unread, /rooms/{id}/read, /dialogs/{id}/read at /api

// SignalR hubs — JWT over WebSocket arrives as ?access_token= (already configured in OnMessageReceived above)
app.MapHub<ChatHerder.API.Hubs.PresenceHub>("/hubs/presence").RequireAuthorization();
app.MapHub<ChatHerder.API.Hubs.ChatHub>("/hubs/chat").RequireAuthorization();

app.Run();

public partial class Program { }
