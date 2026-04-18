namespace ChatHerder.Domain.Entities;

public sealed class Attachment
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid? MessageId { get; init; }
    public Guid? PersonalDialogMessageId { get; init; }
    public required Guid UploadedByUserId { get; init; }
    public required string StoragePath { get; init; }  // relative; resolved via IFileStorage
    public required string FileName { get; init; }
    public required string ContentType { get; init; }
    public required long SizeBytes { get; init; }
    public string? Comment { get; init; }
    public DateTime UploadedAt { get; init; } = DateTime.UtcNow;

    public Message? Message { get; init; }
    public PersonalDialogMessage? PersonalDialogMessage { get; init; }
    public User UploadedByUser { get; init; } = null!;
}
