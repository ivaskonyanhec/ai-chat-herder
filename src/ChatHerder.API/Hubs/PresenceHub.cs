using System.Security.Claims;
using ChatHerder.Application.Ports;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ChatHerder.API.Hubs;

[Authorize]
public sealed class PresenceHub(IPresenceStore presence, IHubContext<ChatHub> chatHub, AppDbContext db) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId    = GetUserId();
        var sessionId = GetSessionId();

        await presence.RegisterTabAsync(userId, Context.ConnectionId);
        await presence.SetConnUserAsync(Context.ConnectionId, userId);
        await presence.SetConnSessionAsync(Context.ConnectionId, sessionId);
        await presence.AddToActiveUsersAsync(userId);

        var previousStatus = await presence.GetStatusAsync(userId);
        await presence.SetStatusAsync(userId, "online");

        if (previousStatus != "online")
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "online" });

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetUserId();

        await presence.UnregisterTabAsync(userId, Context.ConnectionId);

        if (Context.Items.TryGetValue("rooms", out var roomsObj) && roomsObj is HashSet<Guid> rooms)
        {
            foreach (var roomId in rooms)
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}");
                await chatHub.Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}");
                await Clients.OthersInGroup($"room:{roomId}")
                    .SendAsync("MemberLeft", new { roomId, userId });
            }
        }

        var tabCount = await presence.GetTabCountAsync(userId);
        if (tabCount == 0)
        {
            await presence.SetStatusAsync(userId, "offline");
            await presence.RemoveFromActiveUsersAsync(userId);
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "offline" });
        }
        else if (await presence.IsAllTabsAfkAsync(userId))
        {
            await presence.SetStatusAsync(userId, "afk");
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "afk" });
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task Heartbeat()
    {
        var userId = GetUserId();

        // ZADD with current timestamp reuses RegisterTabAsync to refresh the sorted-set score
        await presence.RegisterTabAsync(userId, Context.ConnectionId);
        await presence.ClearAfkTabAsync(userId, Context.ConnectionId);

        var status = await presence.GetStatusAsync(userId);
        if (status == "afk" && !await presence.IsAllTabsAfkAsync(userId))
        {
            await presence.SetStatusAsync(userId, "online");
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "online" });
        }
    }

    public async Task SetAfk()
    {
        var userId = GetUserId();

        await presence.SetAfkTabAsync(userId, Context.ConnectionId);

        if (await presence.IsAllTabsAfkAsync(userId))
        {
            await presence.SetStatusAsync(userId, "afk");
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "afk" });
        }
    }

    public async Task SetActive()
    {
        var userId = GetUserId();

        await presence.ClearAfkTabAsync(userId, Context.ConnectionId);

        var status = await presence.GetStatusAsync(userId);
        if (status == "afk")
        {
            await presence.SetStatusAsync(userId, "online");
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "online" });
        }
    }

    public async Task JoinRoom(Guid roomId)
    {
        var userId = GetUserId();

        var membership = await db.RoomMemberships
            .Include(m => m.User)
            .FirstOrDefaultAsync(m => m.RoomId == roomId && m.UserId == userId);

        if (membership is null)
            return;

        var isBanned = await db.RoomBans
            .AnyAsync(b => b.RoomId == roomId && b.BannedUserId == userId && b.RevokedAt == null);

        if (isBanned)
        {
            await Clients.Caller.SendAsync("RemovedFromRoom", new { roomId });
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"room:{roomId}");
        await chatHub.Groups.AddToGroupAsync(Context.ConnectionId, $"room:{roomId}");

        if (!Context.Items.TryGetValue("rooms", out var roomsObj) || roomsObj is not HashSet<Guid> rooms)
        {
            rooms = new HashSet<Guid>();
            Context.Items["rooms"] = rooms;
        }
        rooms.Add(roomId);

        var allMembers = await db.RoomMemberships
            .Include(m => m.User)
            .Where(m => m.RoomId == roomId)
            .ToListAsync();

        var memberDtos = new List<object>(allMembers.Count);
        foreach (var m in allMembers)
        {
            var presenceStatus = await presence.GetStatusAsync(m.UserId) ?? "offline";
            memberDtos.Add(new
            {
                UserId         = m.UserId,
                m.User.Username,
                m.User.AvatarUrl,
                Role           = m.Role.ToString(),
                m.JoinedAt,
                PresenceStatus = presenceStatus,
            });
        }

        await Clients.Caller.SendAsync("RoomMembersSnapshot", new { roomId, members = memberDtos });

        await Clients.OthersInGroup($"room:{roomId}").SendAsync("MemberJoined", new
        {
            roomId,
            user = new { userId, membership.User.Username, membership.User.AvatarUrl },
        });
    }

    public async Task LeaveRoom(Guid roomId)
    {
        var userId = GetUserId();

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}");
        await chatHub.Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}");

        if (Context.Items.TryGetValue("rooms", out var roomsObj) && roomsObj is HashSet<Guid> rooms)
            rooms.Remove(roomId);

        await Clients.Group($"room:{roomId}").SendAsync("MemberLeft", new { roomId, userId });
    }

    private Guid GetUserId()
    {
        var raw = Context.User?.FindFirstValue("user_id");
        if (!Guid.TryParse(raw, out var id)) throw new HubException("Unauthorized");
        return id;
    }

    private Guid GetSessionId()
    {
        var raw = Context.User?.FindFirstValue("session_id");
        if (!Guid.TryParse(raw, out var id)) throw new HubException("Unauthorized");
        return id;
    }
}
