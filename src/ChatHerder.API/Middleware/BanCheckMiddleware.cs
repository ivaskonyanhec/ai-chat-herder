namespace ChatHerder.API.Middleware;

// Full implementation wired in Phase 2 (Redis ban gate — AGENT.md §7).
// Stub exists here to lock pipeline position: must run after UseAuthentication()
// and before UseAuthorization().
public sealed class BanCheckMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context) => next(context);
}
