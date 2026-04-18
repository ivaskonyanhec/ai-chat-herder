using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Cache;
using ChatHerder.Infrastructure.Email;
using ChatHerder.Infrastructure.Persistence;
using ChatHerder.Infrastructure.Security;
using ChatHerder.Infrastructure.Services;
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

        return services;
    }
}
