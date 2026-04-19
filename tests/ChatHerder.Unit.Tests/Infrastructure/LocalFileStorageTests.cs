using ChatHerder.Infrastructure.Storage;
using Microsoft.Extensions.Configuration;

namespace ChatHerder.Unit.Tests.Infrastructure;

public sealed class LocalFileStorageTests : IDisposable
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    private LocalFileStorage BuildStorage()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection([new KeyValuePair<string, string?>("Storage:BasePath", _tempDir)])
            .Build();
        return new LocalFileStorage(config);
    }

    [Fact]
    public async Task SaveAsync_CreatesFileAtReturnedRelativePath()
    {
        var storage = BuildStorage();
        await using var content = new MemoryStream("hello"u8.ToArray());

        var relPath = await storage.SaveAsync(content, "test.txt");

        Assert.True(File.Exists(Path.Combine(_tempDir, relPath)));
    }

    [Fact]
    public async Task DeleteAsync_RemovesFile()
    {
        var storage = BuildStorage();
        await using var content = new MemoryStream("hello"u8.ToArray());
        var relPath = await storage.SaveAsync(content, "test.txt");

        await storage.DeleteAsync(relPath);

        Assert.False(File.Exists(Path.Combine(_tempDir, relPath)));
    }

    [Fact]
    public async Task DeleteAsync_IsNoOp_WhenFileNotFound()
    {
        var storage = BuildStorage();
        await storage.DeleteAsync("nonexistent/file.txt"); // must not throw
    }

    [Fact]
    public async Task OpenReadAsync_ReturnsStreamWithOriginalContent()
    {
        var storage = BuildStorage();
        var bytes = "world"u8.ToArray();
        await using var content = new MemoryStream(bytes);
        var relPath = await storage.SaveAsync(content, "read.txt");

        await using var stream = await storage.OpenReadAsync(relPath);
        using var reader = new MemoryStream();
        await stream.CopyToAsync(reader);

        Assert.Equal(bytes, reader.ToArray());
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }
}
