namespace ChatHerder.Domain.Entities;

public sealed class PersonalDialogMessage
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid DialogId { get; init; }
    public required Guid AuthorId { get; init; }
    public required string Content { get; set; }
    public required long SequenceNumber { get; init; } // per-dialog monotonic
    public Guid? ReplyToMessageId { get; init; }
    public DateTime SentAt { get; init; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public DateTime? DeletedAt { get; set; }

    public PersonalDialog Dialog { get; init; } = null!;
    public User Author { get; init; } = null!;
    public PersonalDialogMessage? ReplyToMessage { get; init; }
    public Attachment? Attachment { get; init; }
}
