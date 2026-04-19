namespace ChatHerder.Application.DTOs;

public sealed record UserSummary(Guid Id, string Username, string? AvatarUrl);

public sealed record AttachmentDto(
    Guid Id,
    string FileName,
    string ContentType,
    long SizeBytes,
    string? Comment);

public sealed record MessageDto(
    Guid Id,
    long SequenceNumber,
    string? Content,            // null when IsDeleted=true
    UserSummary Sender,
    DateTime SentAt,
    DateTime? EditedAt,
    bool IsDeleted,
    MessageDto? ReplyTo,        // embedded snapshot at send time
    AttachmentDto? Attachment,
    IReadOnlyList<ReactionSummaryDto> Reactions);

public sealed record DialogMessageDto(
    Guid Id,
    long SequenceNumber,
    string? Content,
    UserSummary Sender,
    DateTime SentAt,
    DateTime? EditedAt,
    bool IsDeleted,
    DialogMessageDto? ReplyTo,
    AttachmentDto? Attachment);

public sealed record ToggleReactionRequest(string Emoji);
public sealed record ReactionSummaryDto(string Emoji, int Count, IReadOnlyList<Guid> UserIds);

public sealed record EditMessageRequest(string Content);
public sealed record SendMessageRequest(string Content, Guid? ReplyToId, Guid? AttachmentId);

public sealed record UnreadContextDto(string ContextType, Guid ContextId, long Count);
