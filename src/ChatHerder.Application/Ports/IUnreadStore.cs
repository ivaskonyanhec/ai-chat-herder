namespace ChatHerder.Application.Ports;

public interface IUnreadStore
{
    Task IncrementAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default);
    Task<long> GetCountAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default);
    Task ClearAsync(Guid userId, string contextType, Guid contextId, CancellationToken ct = default);
    Task SetAsync(Guid userId, string contextType, Guid contextId, long count, CancellationToken ct = default);
    Task<IReadOnlyList<(string ContextType, Guid ContextId, long Count)>> GetAllAsync(Guid userId, IReadOnlyList<(string type, Guid id)> contexts, CancellationToken ct = default);
}
