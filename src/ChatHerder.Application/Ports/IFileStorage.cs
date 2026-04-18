namespace ChatHerder.Application.Ports;

public interface IFileStorage
{
    /// <summary>Persists a stream and returns the relative storage path.</summary>
    Task<string> SaveAsync(Stream content, string fileName, CancellationToken ct = default);

    /// <summary>Deletes a file by its relative storage path. No-op if not found.</summary>
    Task DeleteAsync(string storagePath, CancellationToken ct = default);
}
