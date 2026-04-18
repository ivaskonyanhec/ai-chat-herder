namespace ChatHerder.API.Middleware;

// Full implementation wired in Phase 2 (Redis session revocation — AGENT.md §7).
// Stub exists here to lock pipeline position: must run after BanCheckMiddleware
// and before UseAuthorization().
public sealed class SessionValidationMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context) => next(context);
}
