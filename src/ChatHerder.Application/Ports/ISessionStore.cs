namespace ChatHerder.Application.Ports;

public interface ISessionStore
{
    Task AddAsync(Guid userId, Guid sessionId, CancellationToken ct = default);
    Task<bool> IsValidAsync(Guid userId, Guid sessionId, CancellationToken ct = default);
    Task RevokeAsync(Guid userId, Guid sessionId, CancellationToken ct = default);
    /// <summary>Revokes all sessions for <paramref name="userId"/>, optionally sparing one.</summary>
    Task RevokeAllAsync(Guid userId, Guid? exceptSessionId = null, CancellationToken ct = default);
}
