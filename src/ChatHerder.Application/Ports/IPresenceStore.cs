namespace ChatHerder.Application.Ports;

public interface IPresenceStore
{
    Task RegisterTabAsync(Guid userId, string connId, CancellationToken ct = default);
    Task UnregisterTabAsync(Guid userId, string connId, CancellationToken ct = default);
    Task<long> GetTabCountAsync(Guid userId, CancellationToken ct = default);
    Task SetStatusAsync(Guid userId, string status, CancellationToken ct = default);
    Task<string?> GetStatusAsync(Guid userId, CancellationToken ct = default);
    Task SetAfkTabAsync(Guid userId, string connId, CancellationToken ct = default);
    Task ClearAfkTabAsync(Guid userId, string connId, CancellationToken ct = default);
    Task<bool> IsAllTabsAfkAsync(Guid userId, CancellationToken ct = default);
    Task<IReadOnlyList<string>> GetConnectionIdsAsync(Guid userId, CancellationToken ct = default);
    Task SetConnUserAsync(string connId, Guid userId, CancellationToken ct = default);
    Task SetConnSessionAsync(string connId, Guid sessionId, CancellationToken ct = default);
    Task<IReadOnlyList<(string ConnId, double Score)>> GetStaleTabsAsync(Guid userId, double threshold, CancellationToken ct = default);
    Task RemoveStaleTabAsync(Guid userId, string connId, CancellationToken ct = default);
    Task AddToActiveUsersAsync(Guid userId, CancellationToken ct = default);
    Task RemoveFromActiveUsersAsync(Guid userId, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> GetActiveUsersAsync(CancellationToken ct = default);
}
