# Invitation Badge + Sidebar Search Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a red dot badge on the "Invitations" header nav link when the user has pending room invitations, and wire the sidebar search input to filter the rooms list in real time.

**Architecture:** Backend `SendInvitation` pushes `RoomInvitationReceived` to the invitee via SignalR. `PresenceService` handles it and exposes an `invitationReceived` signal. `WorkspaceShellComponent` bootstraps the count from `GET /invitations`, increments it on the signal, and resets to 0 on navigation to `/app/invitations`. The search is a pure frontend `computed()` filter on `myRooms` driven by a `searchQuery` signal.

**Tech Stack:** .NET 10 minimal-API endpoints, xUnit + NSubstitute unit tests, Angular 21 Signals, TypeScript, Tailwind CSS.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/ChatHerder.API/Endpoints/RoomInvitationEndpoints.cs` | Modify | Add SignalR push in `SendInvitation`; expose `SendInvitationInternal` |
| `tests/ChatHerder.Unit.Tests/Endpoints/RoomInvitationEndpointsTests.cs` | Create | 2 unit tests for SignalR push |
| `frontend/src/app/core/signalr/presence.service.ts` | Modify | Register `RoomInvitationReceived` handler; expose `invitationReceived` signal |
| `frontend/src/app/features/workspace/workspace-shell.component.ts` | Modify | `pendingInvitationCount`, `searchQuery`, bootstrap, effect, nav clear, updated computed |
| `frontend/src/app/features/workspace/workspace-shell.component.html` | Modify | Badge dot on Invitations link; bind search input |
| `frontend/src/app/features/workspace/workspace-shell.component.spec.ts` | Modify | Add `invitationReceived` to mock; 4 new tests |

---

### Task 1: Backend — SendInvitation pushes RoomInvitationReceived (TDD)

**Files:**
- Modify: `src/ChatHerder.API/Endpoints/RoomInvitationEndpoints.cs`
- Create: `tests/ChatHerder.Unit.Tests/Endpoints/RoomInvitationEndpointsTests.cs`

- [ ] **Step 1: Create the test file with the first failing test**

```csharp
// tests/ChatHerder.Unit.Tests/Endpoints/RoomInvitationEndpointsTests.cs
using ChatHerder.API.Hubs;
using ChatHerder.Application.DTOs;
using ChatHerder.Application.Ports;
using ChatHerder.Domain.Entities;
using ChatHerder.Domain.Enums;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class RoomInvitationEndpointsTests
{
    private static AppDbContext BuildSqliteContext()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source=file:invitations-{Guid.NewGuid():N}?mode=memory&cache=shared")
            .Options;
        var db = new AppDbContext(opts);
        db.Database.EnsureCreated();
        return db;
    }

    private static ClaimsPrincipal MakePrincipal(Guid userId) =>
        new(new ClaimsIdentity([
            new Claim("user_id", userId.ToString()),
            new Claim("session_id", Guid.NewGuid().ToString()),
        ], "Test"));

    private static int GetStatusCode(IResult r)
    {
        var prop = r.GetType().GetProperty("StatusCode");
        return (int)(prop?.GetValue(r) ?? 0);
    }

    [Fact]
    public async Task SendInvitation_PushesRoomInvitationReceived_ToInviteeConnections()
    {
        await using var db = BuildSqliteContext();

        var ownerId   = Guid.NewGuid();
        var inviteeId = Guid.NewGuid();
        db.Users.AddRange(
            new User { Id = ownerId,   Username = "owner",   Email = "o@x.com", PasswordHash = "x" },
            new User { Id = inviteeId, Username = "invitee", Email = "i@x.com", PasswordHash = "x" });
        var room = new Room { OwnerId = ownerId, Name = "secret", Visibility = RoomVisibility.Private };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = ownerId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(inviteeId, Arg.Any<CancellationToken>())
                .Returns(new[] { "conn-invitee" });

        var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
        var hubClients  = Substitute.For<IHubClients>();
        presenceHub.Clients.Returns(hubClients);
        var clientProxy = Substitute.For<ISingleClientProxy>();
        hubClients.Client(Arg.Any<string>()).Returns(clientProxy);

        var result = await RoomInvitationEndpointsHelper.SendInvitation(
            room.Id, new InviteUserRequest("invitee"),
            MakePrincipal(ownerId), db, presenceHub, presence,
            CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.RoomInvitations.CountAsync());
        hubClients.Received(1).Client("conn-invitee");
        await clientProxy.Received(1).SendCoreAsync(
            "RoomInvitationReceived", Arg.Any<object[]>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SendInvitation_DoesNotPushSignalR_WhenInviteeHasNoConnections()
    {
        await using var db = BuildSqliteContext();

        var ownerId   = Guid.NewGuid();
        var inviteeId = Guid.NewGuid();
        db.Users.AddRange(
            new User { Id = ownerId,   Username = "owner2",   Email = "o2@x.com", PasswordHash = "x" },
            new User { Id = inviteeId, Username = "invitee2", Email = "i2@x.com", PasswordHash = "x" });
        var room = new Room { OwnerId = ownerId, Name = "secret2", Visibility = RoomVisibility.Private };
        db.Rooms.Add(room);
        db.RoomMemberships.Add(new RoomMembership { RoomId = room.Id, UserId = ownerId, Role = MemberRole.Owner });
        await db.SaveChangesAsync();

        var presence    = Substitute.For<IPresenceStore>();
        presence.GetConnectionIdsAsync(inviteeId, Arg.Any<CancellationToken>())
                .Returns(Array.Empty<string>());

        var presenceHub = Substitute.For<IHubContext<PresenceHub>>();
        var hubClients  = Substitute.For<IHubClients>();
        presenceHub.Clients.Returns(hubClients);
        var clientProxy = Substitute.For<ISingleClientProxy>();
        hubClients.Client(Arg.Any<string>()).Returns(clientProxy);

        var result = await RoomInvitationEndpointsHelper.SendInvitation(
            room.Id, new InviteUserRequest("invitee2"),
            MakePrincipal(ownerId), db, presenceHub, presence,
            CancellationToken.None);

        Assert.Equal(204, GetStatusCode(result));
        Assert.Equal(1, await db.RoomInvitations.CountAsync());
        hubClients.DidNotReceive().Client(Arg.Any<string>());
        await clientProxy.DidNotReceive().SendCoreAsync(
            Arg.Any<string>(), Arg.Any<object[]>(), Arg.Any<CancellationToken>());
    }
}

internal static class RoomInvitationEndpointsHelper
{
    public static Task<IResult> SendInvitation(
        Guid roomId, InviteUserRequest req,
        ClaimsPrincipal principal, AppDbContext db,
        IHubContext<PresenceHub> presenceHub, IPresenceStore presence,
        CancellationToken ct)
        => ChatHerder.API.Endpoints.RoomInvitationEndpoints.SendInvitationInternal(
            roomId, req, principal, db, presenceHub, presence, ct);
}
```

- [ ] **Step 2: Run the tests — confirm RED (compile error)**

```bash
dotnet build tests/ChatHerder.Unit.Tests/ChatHerder.Unit.Tests.csproj
```

Expected: `error CS0117: 'RoomInvitationEndpoints' does not contain a definition for 'SendInvitationInternal'`

- [ ] **Step 3: Update `RoomInvitationEndpoints.cs` — add hub parameters and push**

Replace the `SendInvitation` method and add `SendInvitationInternal`:

```csharp
// Add this using at the top:
using ChatHerder.API.Hubs;
using Microsoft.AspNetCore.SignalR;

// In MapRoomInvitationEndpoints, replace the SendInvitation route:
group.MapPost("/rooms/{roomId:guid}/invitations",
    (Guid roomId, InviteUserRequest req, ClaimsPrincipal p, AppDbContext db,
     IHubContext<PresenceHub> hub, IPresenceStore presence, CancellationToken ct)
        => SendInvitation(roomId, req, p, db, hub, presence, ct)).RequireAuthorization();

// Add internal shim after the existing internal methods:
internal static Task<IResult> SendInvitationInternal(
    Guid roomId, InviteUserRequest req, ClaimsPrincipal principal, AppDbContext db,
    IHubContext<PresenceHub> presenceHub, IPresenceStore presence, CancellationToken ct)
    => SendInvitation(roomId, req, principal, db, presenceHub, presence, ct);

// Replace private SendInvitation signature + add SignalR push at the end:
private static async Task<IResult> SendInvitation(
    Guid roomId,
    InviteUserRequest req,
    ClaimsPrincipal principal,
    AppDbContext db,
    IHubContext<PresenceHub> presenceHub,
    IPresenceStore presence,
    CancellationToken ct)
{
    if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var callerId))
        return Results.Unauthorized();

    var callerRole = await db.RoomMemberships
        .Where(m => m.RoomId == roomId && m.UserId == callerId)
        .Select(m => (MemberRole?)m.Role)
        .FirstOrDefaultAsync(ct);

    if (callerRole is null or MemberRole.Member) return Results.Forbid();

    var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId && r.DeletedAt == null, ct);
    if (room is null) return Results.NotFound();

    var invitee = await db.Users.FirstOrDefaultAsync(u => u.Username == req.Username && u.DeletedAt == null, ct);
    if (invitee is null) return Results.NotFound(new { error = "User not found." });

    if (await db.RoomMemberships.AnyAsync(m => m.RoomId == roomId && m.UserId == invitee.Id, ct))
        return Results.Conflict(new { error = "User is already a member." });

    if (await db.RoomBans.AnyAsync(b => b.RoomId == roomId && b.BannedUserId == invitee.Id && b.RevokedAt == null, ct))
        return Results.Problem("User is banned from this room.", statusCode: 403);

    var invitation = new RoomInvitation
    {
        RoomId          = roomId,
        InvitedByUserId = callerId,
        InvitedUserId   = invitee.Id,
        Status          = InvitationStatus.Pending,
    };
    db.RoomInvitations.Add(invitation);
    await db.SaveChangesAsync(ct);

    var connIds = await presence.GetConnectionIdsAsync(invitee.Id, ct);
    foreach (var connId in connIds)
        await presenceHub.Clients.Client(connId)
            .SendAsync("RoomInvitationReceived",
                new { invitationId = invitation.Id, roomId, roomName = room.Name, fromUserId = callerId },
                cancellationToken: ct);

    return Results.NoContent();
}
```

- [ ] **Step 4: Run the tests — confirm GREEN**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ChatHerder.Unit.Tests.csproj --filter "SendInvitation"
```

Expected: `Passed! - Failed: 0, Passed: 2`

- [ ] **Step 5: Run full .NET suite — confirm nothing broken**

```bash
dotnet test ChatHerder.sln
```

Expected: all tests pass (108 unit + 2 integration).

- [ ] **Step 6: Commit**

```bash
git add src/ChatHerder.API/Endpoints/RoomInvitationEndpoints.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/RoomInvitationEndpointsTests.cs
git commit -m "feat: SendInvitation pushes RoomInvitationReceived SignalR event to invitee"
```

---

### Task 2: Frontend — PresenceService handles RoomInvitationReceived

**Files:**
- Modify: `frontend/src/app/core/signalr/presence.service.ts`

Note: `RoomInvitationReceivedEvent` is already defined in `hub.models.ts` — no change needed there.

- [ ] **Step 1: Add the signal and handler to `presence.service.ts`**

Add import for `RoomInvitationReceivedEvent`:

```typescript
// In the import block, add:
import type {
  // ...existing imports...
  RoomInvitationReceivedEvent,
} from './hub.models';
```

Add the private signal after `_addedToRoom`:

```typescript
private readonly _invitationReceived = signal<RoomInvitationReceivedEvent | null>(null);
readonly invitationReceived = this._invitationReceived.asReadonly();
```

Add the handler inside `registerHandlers`, after the `AddedToRoom` handler:

```typescript
conn.on('RoomInvitationReceived', (e: RoomInvitationReceivedEvent) => {
  this._invitationReceived.set(e);
});
```

- [ ] **Step 2: Run Angular typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/signalr/presence.service.ts
git commit -m "feat: PresenceService handles RoomInvitationReceived signal"
```

---

### Task 3: Frontend — WorkspaceShell invitation count + search (logic only)

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.ts`

- [ ] **Step 1: Update `workspace-shell.component.ts`**

Add imports at the top:
```typescript
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
// effect is already imported — no change
```

Add new signals after `sidebarOpen`:
```typescript
readonly pendingInvitationCount = signal(0);
readonly searchQuery = signal('');
```

Update `publicRooms` and `privateRooms` computed to include the search filter:
```typescript
readonly publicRooms = computed(() => {
  const q = this.searchQuery().toLowerCase();
  return this.myRooms().filter(r =>
    r.visibility === 'Public' && (!q || r.name.toLowerCase().includes(q))
  );
});

readonly privateRooms = computed(() => {
  const q = this.searchQuery().toLowerCase();
  return this.myRooms().filter(r =>
    r.visibility === 'Private' && (!q || r.name.toLowerCase().includes(q))
  );
});
```

Inject `InvitationsApiService` (add to imports at top of file):
```typescript
import { InvitationsApiService } from '../../core/invitations/invitations-api.service';
// ...
private readonly invitationsApi = inject(InvitationsApiService);
```

Add a second `effect()` in the constructor for `invitationReceived`:
```typescript
constructor() {
  effect(() => {
    if (this.presence.addedToRoom()) this.loadRooms();
  });
  effect(() => {
    if (this.presence.invitationReceived()) {
      this.pendingInvitationCount.update(n => n + 1);
    }
  });
}
```

In `bootstrapData()`, load the initial invitation count:
```typescript
private bootstrapData(): void {
  this.loadRooms();
  this.notificationsApi.getUnreadCounts().subscribe({
    next: counts => counts.forEach(c => this.unread.setCount(c.contextType, c.contextId, c.count)),
  });
  this.friendsApi.getFriends().subscribe({
    next: friends => this.friends.set(friends),
  });
  this.invitationsApi.getMyInvitations().subscribe({
    next: invitations => this.pendingInvitationCount.set(
      invitations.filter(i => i.status === 'Pending').length
    ),
  });
}
```

In `ngOnInit`, add a reset on navigation to `/app/invitations`:
```typescript
this.router.events
  .pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    takeUntilDestroyed(this.destroyRef),
  )
  .subscribe(event => {
    this.loadRooms();
    if (event.urlAfterRedirects === '/app/invitations') {
      this.pendingInvitationCount.set(0);
    }
  });
```

- [ ] **Step 2: Run Angular typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/workspace/workspace-shell.component.ts
git commit -m "feat: workspace shell tracks pending invitation count and search filter"
```

---

### Task 4: Frontend — Badge UI and search input binding

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.html`

- [ ] **Step 1: Add badge dot on Invitations nav link**

Replace the plain Invitations `<a>` (line 10):

```html
<span class="relative">
  <a routerLink="/app/invitations"
     routerLinkActive="border-b-2 border-white text-white"
     class="text-on-primary/70 hover:text-on-primary transition-colors pb-1">Invitations</a>
  @if (pendingInvitationCount() > 0) {
    <span class="absolute -top-1 -right-2 w-2 h-2 bg-error rounded-full"
          data-testid="invitation-badge"></span>
  }
</span>
```

- [ ] **Step 2: Bind the search input**

Replace the static search `<input>` (line 53):

```html
<input
  class="bg-transparent border-none focus:outline-none p-0 text-sm w-full placeholder-on-surface-variant"
  placeholder="Search workspace..."
  type="text"
  [value]="searchQuery()"
  (input)="searchQuery.set($any($event.target).value)"
/>
```

- [ ] **Step 3: Run Angular typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/workspace/workspace-shell.component.html
git commit -m "feat: invitation badge dot and wired search input in workspace shell"
```

---

### Task 5: Frontend — Tests

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.spec.ts`

- [ ] **Step 1: Add `invitationReceived` to the presence mock stub**

In `buildProviders`, update the `presenceService` mock:

```typescript
const presenceService: HubStub = overrides.presenceService ?? {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  presenceMap: signal(new Map()).asReadonly(),
  addedToRoom: signal(null).asReadonly(),
  invitationReceived: signal(null).asReadonly(),  // ADD THIS
};
```

Update the `HubStub` type:
```typescript
type HubStub = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  presenceMap?: unknown;
  addedToRoom?: unknown;
  invitationReceived?: unknown;   // ADD THIS
};
```

Also update the `InvitationsApiService` provider in `buildProviders` (add it after `NotificationsApiService`):
```typescript
{ provide: InvitationsApiService, useValue: { getMyInvitations: vi.fn().mockReturnValue(of([])) } },
```

And add the import at the top:
```typescript
import { InvitationsApiService } from '../../core/invitations/invitations-api.service';
```

- [ ] **Step 2: Add 4 new tests**

```typescript
it('shows invitation badge when pendingInvitationCount > 0', async () => {
  const { providers } = buildProviders();
  TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
  const fixture = TestBed.createComponent(WorkspaceShellComponent);
  fixture.componentInstance.pendingInvitationCount.set(3);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[data-testid="invitation-badge"]')).not.toBeNull();
});

it('hides invitation badge when pendingInvitationCount is 0', async () => {
  const { providers } = buildProviders();
  TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
  const fixture = TestBed.createComponent(WorkspaceShellComponent);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[data-testid="invitation-badge"]')).toBeNull();
});

it('bootstraps pendingInvitationCount from GET /invitations', async () => {
  const { providers } = buildProviders();
  const invitationsStub = {
    getMyInvitations: vi.fn().mockReturnValue(of([
      { id: 'i1', status: 'Pending' },
      { id: 'i2', status: 'Pending' },
    ])),
  };
  const providersWithInvitations = providers.map(p =>
    'provide' in p && p.provide === InvitationsApiService
      ? { provide: InvitationsApiService, useValue: invitationsStub }
      : p,
  );
  TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers: providersWithInvitations });
  const fixture = TestBed.createComponent(WorkspaceShellComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  expect(fixture.componentInstance.pendingInvitationCount()).toBe(2);
});

it('filters publicRooms by searchQuery', async () => {
  const rooms: RoomDto[] = [
    { id: 'r1', name: 'General', description: null, visibility: 'Public', ownerId: 'u1', createdAt: '', memberCount: 1, callerRole: 'Member' },
    { id: 'r2', name: 'Design', description: null, visibility: 'Public', ownerId: 'u1', createdAt: '', memberCount: 1, callerRole: 'Member' },
  ];
  const roomsApi = { getMyRooms: vi.fn().mockReturnValue(of(rooms)), createRoom: vi.fn() };
  const { providers } = buildProviders();
  const providersWithRooms = providers.map(p =>
    'provide' in p && p.provide === RoomsApiService ? { provide: RoomsApiService, useValue: roomsApi } : p,
  );
  TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers: providersWithRooms });
  const fixture = TestBed.createComponent(WorkspaceShellComponent);
  fixture.detectChanges();
  await fixture.whenStable();

  fixture.componentInstance.searchQuery.set('des');
  expect(fixture.componentInstance.publicRooms()).toHaveLength(1);
  expect(fixture.componentInstance.publicRooms()[0].name).toBe('Design');
});
```

- [ ] **Step 3: Run Angular tests — confirm all pass**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -8
```

Expected: all tests pass (170+ passed, 0 failed).

- [ ] **Step 4: Run full .NET suite one more time**

```bash
dotnet test ChatHerder.sln
```

Expected: all tests pass.

- [ ] **Step 5: Final commit**

```bash
git add frontend/src/app/features/workspace/workspace-shell.component.spec.ts \
        frontend/src/app/core/signalr/presence.service.ts
git commit -m "test: workspace shell invitation badge and search filter tests"
```

---

### Task 6: Update DEVELOPMENT_LOG.md

- [ ] **Step 1: Append T199 entry**

Append to `DEVELOPMENT_LOG.md` (check the last T-number first with `grep -E "T[0-9]+" DEVELOPMENT_LOG.md | tail -3`):

```
`[2026-04-19 T199]` | **[Feature] Invitation badge in header nav + sidebar search filter** | No badge existed on the Invitations nav link; sidebar search input was static with no binding. Backend: `SendInvitation` now injects `IHubContext<PresenceHub>` + `IPresenceStore` and pushes `RoomInvitationReceived` to the invitee's active connections after save; `SendInvitationInternal` exposed for testability. Frontend: `PresenceService` registers `RoomInvitationReceived` handler and exposes `invitationReceived` signal; `WorkspaceShellComponent` bootstraps pending count from `GET /invitations`, increments via `effect()` on `invitationReceived`, resets to 0 on `NavigationEnd` to `/app/invitations`; `searchQuery` signal drives `computed` filters on `publicRooms` and `privateRooms`; badge dot and search `(input)` binding added to HTML. 2 backend unit tests + 4 frontend unit tests added. | `src/ChatHerder.API/Endpoints/RoomInvitationEndpoints.cs`, `tests/.../RoomInvitationEndpointsTests.cs`, `frontend/.../presence.service.ts`, `frontend/.../workspace-shell.component.{ts,html,spec.ts}` | **[VERIFIED]**
```

```bash
git add DEVELOPMENT_LOG.md
git commit -m "chore: log T199 invitation badge and search filter"
```
