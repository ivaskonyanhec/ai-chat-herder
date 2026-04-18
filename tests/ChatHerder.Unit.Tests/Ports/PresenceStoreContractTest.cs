using ChatHerder.Application.Ports;
using NSubstitute;

namespace ChatHerder.Unit.Tests.Ports;

public sealed class PresenceStoreContractTest
{
    [Fact]
    public async Task IPresenceStore_GetStatusAsync_ReturnsNull_WhenNotSet()
    {
        var store = Substitute.For<IPresenceStore>();
        store.GetStatusAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns((string?)null);

        var result = await store.GetStatusAsync(Guid.NewGuid());

        Assert.Null(result);
    }
}
