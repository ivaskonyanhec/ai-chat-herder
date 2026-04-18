using System.Security.Claims;
using StackExchange.Redis;

namespace ChatHerder.API.Middleware;

// Runs after UseAuthentication(). Checks Redis ban:{userId}. Returns 403 if banned.
// Do not reorder — must precede SessionValidationMiddleware and UseAuthorization().
public sealed class BanCheckMiddleware(RequestDelegate next, IConnectionMultiplexer redis)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var userId = context.User.FindFirstValue("user_id");
            if (userId is not null)
            {
                var db = redis.GetDatabase();
                if (await db.KeyExistsAsync($"ban:{userId}"))
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await context.Response.WriteAsJsonAsync(new { error = "Account is banned." });
                    return;
                }
            }
        }
        await next(context);
    }
}
