using ChatHerder.Application.Ports;
using Microsoft.Extensions.Configuration;

namespace ChatHerder.Infrastructure.Storage;

public sealed class LocalFileStorage(IConfiguration config) : IFileStorage
{
    private readonly string _basePath = config["Storage:BasePath"]
        ?? throw new InvalidOperationException("Storage:BasePath is not configured.");

    public async Task<string> SaveAsync(Stream content, string fileName, CancellationToken ct = default)
    {
        var relPath = Path.Combine(Guid.NewGuid().ToString("N"), Path.GetFileName(fileName));
        var fullPath = Path.Combine(_basePath, relPath);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        await using var file = File.Create(fullPath);
        await content.CopyToAsync(file, ct);
        return relPath;
    }

    public Task DeleteAsync(string storagePath, CancellationToken ct = default)
    {
        var fullPath = Path.Combine(_basePath, storagePath);
        if (File.Exists(fullPath)) File.Delete(fullPath);
        return Task.CompletedTask;
    }

    public Task<Stream> OpenReadAsync(string storagePath, CancellationToken ct = default)
    {
        var fullPath = Path.Combine(_basePath, storagePath);
        return Task.FromResult<Stream>(File.OpenRead(fullPath));
    }
}
