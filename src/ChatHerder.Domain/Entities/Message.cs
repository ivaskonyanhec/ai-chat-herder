namespace ChatHerder.Domain.Entities;

public sealed class Message
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid RoomId { get; init; }
    public required Guid AuthorId { get; init; }
    public required string Content { get; set; }      // max 3 KB enforced at endpoint
    public required long SequenceNumber { get; init; } // per-room monotonic; allocated via ContextSequences
    public Guid? ReplyToMessageId { get; init; }       // self-ref nullable FK
    public Guid? AttachmentId { get; init; }
    public DateTime SentAt { get; init; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedByUserId { get; set; }

    public Room Room { get; init; } = null!;
    public User Author { get; init; } = null!;
    public Message? ReplyToMessage { get; init; }
    public Attachment? Attachment { get; init; }
}
