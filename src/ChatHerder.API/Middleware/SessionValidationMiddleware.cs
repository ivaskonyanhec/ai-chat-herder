using System.Security.Claims;
using StackExchange.Redis;

namespace ChatHerder.API.Middleware;

// Runs after BanCheckMiddleware(). SISMEMBER sessions:valid:{userId} {sessionId}.
// Returns 401 if the session has been revoked. Do not reorder.
public sealed class SessionValidationMiddleware(RequestDelegate next, IConnectionMultiplexer redis)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var userId    = context.User.FindFirstValue("user_id");
            var sessionId = context.User.FindFirstValue("session_id");

            if (userId is not null && sessionId is not null)
            {
                var db = redis.GetDatabase();
                if (!await db.SetContainsAsync($"sessions:valid:{userId}", sessionId))
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    await context.Response.WriteAsJsonAsync(new { error = "Session has been revoked." });
                    return;
                }
            }
        }
        await next(context);
    }
}
