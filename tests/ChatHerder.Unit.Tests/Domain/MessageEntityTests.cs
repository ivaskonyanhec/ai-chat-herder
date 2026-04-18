using ChatHerder.Domain.Entities;

namespace ChatHerder.Unit.Tests.Domain;

public sealed class MessageEntityTests
{
    [Fact]
    public void Message_HasAttachmentId_Property()
    {
        var prop = typeof(Message).GetProperty("AttachmentId");
        Assert.NotNull(prop);
        Assert.Equal(typeof(Guid?), prop.PropertyType);
    }

    [Fact]
    public void Message_HasEditedAt_Property()
    {
        var prop = typeof(Message).GetProperty("EditedAt");
        Assert.NotNull(prop);
        Assert.Equal(typeof(DateTime?), prop.PropertyType);
    }

    [Fact]
    public void Message_HasDeletedByUserId_Property()
    {
        var prop = typeof(Message).GetProperty("DeletedByUserId");
        Assert.NotNull(prop);
        Assert.Equal(typeof(Guid?), prop.PropertyType);
    }

    [Fact]
    public void PersonalDialogMessage_HasAttachmentId_Property()
    {
        var prop = typeof(PersonalDialogMessage).GetProperty("AttachmentId");
        Assert.NotNull(prop);
        Assert.Equal(typeof(Guid?), prop.PropertyType);
    }

    [Fact]
    public void PersonalDialogMessage_HasEditedAt_Property()
    {
        var prop = typeof(PersonalDialogMessage).GetProperty("EditedAt");
        Assert.NotNull(prop);
        Assert.Equal(typeof(DateTime?), prop.PropertyType);
    }
}
