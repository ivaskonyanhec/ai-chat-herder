using ChatHerder.Domain.Entities;

namespace ChatHerder.Unit.Tests.Domain;

public sealed class EntityShapeTests
{
    [Fact]
    public void RoomBan_HasBannedUserIdProperty()
        => Assert.NotNull(typeof(RoomBan).GetProperty("BannedUserId"));

    [Fact]
    public void RoomBan_HasRevokedByUserIdProperty()
        => Assert.NotNull(typeof(RoomBan).GetProperty("RevokedByUserId"));

    [Fact]
    public void ReadMarker_ContextType_IsString()
        => Assert.Equal(typeof(string), typeof(ReadMarker).GetProperty("ContextType")!.PropertyType);

    [Fact]
    public void ReadMarker_HasLastReadMessageIdProperty()
        => Assert.NotNull(typeof(ReadMarker).GetProperty("LastReadMessageId"));

    [Fact]
    public void ReadMarker_HasLastReadAtProperty()
        => Assert.NotNull(typeof(ReadMarker).GetProperty("LastReadAt"));
}
