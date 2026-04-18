using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ChatHerder.API.Hubs;

[Authorize]
public sealed class ChatHub : Hub
{
}
