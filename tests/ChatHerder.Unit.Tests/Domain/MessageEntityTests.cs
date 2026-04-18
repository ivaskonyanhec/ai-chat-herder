using ChatHerder.Domain.Entities;

namespace ChatHerder.Unit.Tests.Domain;

public sealed class MessageEntityTests
{
    [Fact]
    public void Message_EditedAt_IsNullByDefault()
    {
        var msg = new Message
        {
            RoomId = Guid.NewGuid(),
            AuthorId = Guid.NewGuid(),
            Content = "hello",
            SequenceNumber = 1,
        };

        Assert.Null(msg.EditedAt);
    }

    [Fact]
    public void Message_EditedAt_CanBeSet()
    {
        var msg = new Message
        {
            RoomId = Guid.NewGuid(),
            AuthorId = Guid.NewGuid(),
            Content = "hello",
            SequenceNumber = 1,
        };
        var ts = DateTime.UtcNow;

        msg.EditedAt = ts;

        Assert.Equal(ts, msg.EditedAt);
    }

    [Fact]
    public void Message_DeletedByUserId_IsNullByDefault()
    {
        var msg = new Message
        {
            RoomId = Guid.NewGuid(),
            AuthorId = Guid.NewGuid(),
            Content = "hello",
            SequenceNumber = 1,
        };

        Assert.Null(msg.DeletedByUserId);
    }

    [Fact]
    public void Message_DeletedByUserId_CanBeSet()
    {
        var msg = new Message
        {
            RoomId = Guid.NewGuid(),
            AuthorId = Guid.NewGuid(),
            Content = "hello",
            SequenceNumber = 1,
        };
        var adminId = Guid.NewGuid();

        msg.DeletedByUserId = adminId;

        Assert.Equal(adminId, msg.DeletedByUserId);
    }

    [Fact]
    public void PersonalDialogMessage_EditedAt_IsNullByDefault()
    {
        var dm = new PersonalDialogMessage
        {
            DialogId = Guid.NewGuid(),
            AuthorId = Guid.NewGuid(),
            Content = "hello",
            SequenceNumber = 1,
        };

        Assert.Null(dm.EditedAt);
    }
}
