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
        var ct        = Context.ConnectionAborted;

        await presence.RegisterTabAsync(userId, Context.ConnectionId, ct);
        await presence.SetConnUserAsync(Context.ConnectionId, userId, ct);
        await presence.SetConnSessionAsync(Context.ConnectionId, sessionId, ct);
        await presence.AddToActiveUsersAsync(userId, ct);

        var previousStatus = await presence.GetStatusAsync(userId, ct);
        await presence.SetStatusAsync(userId, "online", ct);

        if (previousStatus != "online")
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "online" }, ct);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetUserId();
        var ct     = Context.ConnectionAborted;

        await presence.UnregisterTabAsync(userId, Context.ConnectionId, ct);

        if (Context.Items.TryGetValue("rooms", out var roomsObj) && roomsObj is HashSet<Guid> rooms)
        {
            foreach (var roomId in rooms)
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}", CancellationToken.None);
                await chatHub.Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}", CancellationToken.None);
                await Clients.OthersInGroup($"room:{roomId}")
                    .SendAsync("MemberLeft", new { roomId, userId }, ct);
            }
        }

        if (Context.Items.TryGetValue("dialogs", out var dialogsObj) && dialogsObj is HashSet<Guid> dialogs)
        {
            foreach (var dialogId in dialogs)
                await chatHub.Groups.RemoveFromGroupAsync(Context.ConnectionId, $"dialog:{dialogId}", CancellationToken.None);
        }

        var tabCount = await presence.GetTabCountAsync(userId, ct);
        if (tabCount == 0)
        {
            await presence.SetStatusAsync(userId, "offline", ct);
            await presence.RemoveFromActiveUsersAsync(userId, ct);
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "offline" }, ct);
        }
        else if (await presence.IsAllTabsAfkAsync(userId, ct))
        {
            await presence.SetStatusAsync(userId, "afk", ct);
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "afk" }, ct);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task Heartbeat()
    {
        var userId = GetUserId();
        var ct     = Context.ConnectionAborted;

        // ZADD with current timestamp reuses RegisterTabAsync to refresh the sorted-set score
        await presence.RegisterTabAsync(userId, Context.ConnectionId, ct);
        await presence.ClearAfkTabAsync(userId, Context.ConnectionId, ct);

        var status = await presence.GetStatusAsync(userId, ct);
        if (status == "afk" && !await presence.IsAllTabsAfkAsync(userId, ct))
        {
            await presence.SetStatusAsync(userId, "online", ct);
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "online" }, ct);
        }
    }

    public async Task SetAfk()
    {
        var userId = GetUserId();
        var ct     = Context.ConnectionAborted;

        await presence.SetAfkTabAsync(userId, Context.ConnectionId, ct);

        if (await presence.IsAllTabsAfkAsync(userId, ct))
        {
            await presence.SetStatusAsync(userId, "afk", ct);
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "afk" }, ct);
        }
    }

    public async Task SetActive()
    {
        var userId = GetUserId();
        var ct     = Context.ConnectionAborted;

        await presence.ClearAfkTabAsync(userId, Context.ConnectionId, ct);

        var status = await presence.GetStatusAsync(userId, ct);
        if (status == "afk")
        {
            await presence.SetStatusAsync(userId, "online", ct);
            await Clients.All.SendAsync("UserStatusChanged", new { userId, status = "online" }, ct);
        }
    }

    public async Task JoinRoom(Guid roomId)
    {
        var userId = GetUserId();
        var ct     = Context.ConnectionAborted;

        var membership = await db.RoomMemberships
            .Include(m => m.User)
            .FirstOrDefaultAsync(m => m.RoomId == roomId && m.UserId == userId, ct);

        if (membership is null)
            return;

        var isBanned = await db.RoomBans
            .AnyAsync(b => b.RoomId == roomId && b.BannedUserId == userId && b.RevokedAt == null, ct);

        if (isBanned)
        {
            await Clients.Caller.SendAsync("RemovedFromRoom", new { roomId }, ct);
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"room:{roomId}", ct);
        await chatHub.Groups.AddToGroupAsync(Context.ConnectionId, $"room:{roomId}", ct);

        if (!Context.Items.TryGetValue("rooms", out var roomsObj) || roomsObj is not HashSet<Guid> rooms)
        {
            rooms = new HashSet<Guid>();
            Context.Items["rooms"] = rooms;
        }
        rooms.Add(roomId);

        var allMembers = await db.RoomMemberships
            .Include(m => m.User)
            .Where(m => m.RoomId == roomId)
            .ToListAsync(ct);

        var statusTasks = allMembers.Select(m => presence.GetStatusAsync(m.UserId, ct)).ToList();
        var statuses    = await Task.WhenAll(statusTasks);
        var memberDtos  = allMembers.Select((m, i) => (object)new
        {
            m.UserId,
            m.User.Username,
            m.User.AvatarUrl,
            Role           = m.Role.ToString(),
            m.JoinedAt,
            PresenceStatus = statuses[i] ?? "offline",
        }).ToList();

        await Clients.Caller.SendAsync("RoomMembersSnapshot", new { roomId, members = memberDtos }, ct);

        await Clients.OthersInGroup($"room:{roomId}").SendAsync("MemberJoined", new
        {
            roomId,
            user = new { userId, membership.User.Username, membership.User.AvatarUrl },
        }, ct);
    }

    public async Task LeaveRoom(Guid roomId)
    {
        var userId = GetUserId();
        var ct     = Context.ConnectionAborted;

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}", ct);
        await chatHub.Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room:{roomId}", ct);

        if (Context.Items.TryGetValue("rooms", out var roomsObj) && roomsObj is HashSet<Guid> rooms)
            rooms.Remove(roomId);

        await Clients.Group($"room:{roomId}").SendAsync("MemberLeft", new { roomId, userId }, ct);
    }

    public async Task JoinDialog(Guid dialogId)
    {
        var userId = GetUserId();
        var ct     = Context.ConnectionAborted;

        var isParticipant = await db.PersonalDialogs
            .AnyAsync(d => d.Id == dialogId && (d.User1Id == userId || d.User2Id == userId), ct);

        if (!isParticipant) return;

        if (!Context.Items.TryGetValue("dialogs", out var dialogsObj) || dialogsObj is not HashSet<Guid> dialogs)
        {
            dialogs = new HashSet<Guid>();
            Context.Items["dialogs"] = dialogs;
        }

        if (dialogs.Add(dialogId))  // HashSet.Add returns false if already present
            await chatHub.Groups.AddToGroupAsync(Context.ConnectionId, $"dialog:{dialogId}", ct);
    }

    public async Task LeaveDialog(Guid dialogId)
    {
        var ct = Context.ConnectionAborted;
        await chatHub.Groups.RemoveFromGroupAsync(Context.ConnectionId, $"dialog:{dialogId}", ct);

        if (Context.Items.TryGetValue("dialogs", out var dialogsObj) && dialogsObj is HashSet<Guid> dialogs)
            dialogs.Remove(dialogId);
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
