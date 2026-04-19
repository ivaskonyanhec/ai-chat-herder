# Phase 4g: Admin Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `ManageRoomComponent` (5-tab room admin modal), `PlatformBansComponent` (platform ban admin page), and add `BlocksApiService` + dynamic sidebar with unread badges; also implement the only missing backend piece — platform ban REST endpoints.

**Architecture:** Backend adds `PlatformBansEndpoints` (GET/POST/DELETE `/admin/bans`) which write to `PlatformBans` table and sync the Redis `ban:{userId}` key already checked by `BanCheckMiddleware`. All room-admin REST routes already exist in `RoomEndpoints.cs`. Frontend adds `RoomsAdminApiService` and `PlatformBansApiService`, wires the two existing empty component stubs to live data, adds `BlocksApiService`, and makes the sidebar dynamic with unread badge counts from the existing `UnreadService`.

**Tech Stack:** .NET 10 Minimal APIs, EF Core 10 InMemory + NSubstitute (unit tests), StackExchange.Redis, Angular 21 Signals, `HttpClient` + `HttpTestingController`, xUnit.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/ChatHerder.Application/DTOs/PlatformBanDtos.cs` | Create | `IssuePlatformBanRequest`, `PlatformBanDto` records |
| `src/ChatHerder.API/Endpoints/PlatformBansEndpoints.cs` | Create | GET/POST/DELETE `/admin/bans` |
| `src/ChatHerder.API/Program.cs` | Modify | Register `/admin/bans` route group |
| `tests/ChatHerder.Unit.Tests/Endpoints/PlatformBansEndpointsTests.cs` | Create | 6 unit tests for the three endpoint handlers |
| `frontend/src/app/core/admin/admin.models.ts` | Create | `PlatformBanDto`, `IssuePlatformBanRequest` TS interfaces |
| `frontend/src/app/core/admin/platform-bans-api.service.ts` | Create | `PlatformBansApiService` (GET/POST/DELETE) |
| `frontend/src/app/core/admin/platform-bans-api.service.spec.ts` | Create | 3 HTTP tests |
| `frontend/src/app/features/admin/platform-bans/platform-bans.ts` | Modify | Wire signals + form + actions |
| `frontend/src/app/features/admin/platform-bans/platform-bans.html` | Modify | Wire `@for`, form bindings, revoke button |
| `frontend/src/app/core/rooms/rooms.models.ts` | Modify | Add `RoomBanDto`, `RoomInvitationDto`, `UpdateRoomRequest` |
| `frontend/src/app/core/rooms/rooms-admin-api.service.ts` | Create | 9 admin API methods |
| `frontend/src/app/core/rooms/rooms-admin-api.service.spec.ts` | Create | 9 HTTP tests |
| `frontend/src/app/features/rooms/manage-room/manage-room.ts` | Modify | Wire 5-tab modal with signals and actions |
| `frontend/src/app/features/rooms/manage-room/manage-room.html` | Modify | Complete dynamic template with all 5 tab views |
| `frontend/src/app/features/rooms/manage-room/manage-room.spec.ts` | Modify | Replace stub test with 4 meaningful tests |
| `frontend/src/app/core/blocks/blocks.models.ts` | Create | `BlockDto` TS interface |
| `frontend/src/app/core/blocks/blocks-api.service.ts` | Create | `BlocksApiService` (GET/POST/DELETE) |
| `frontend/src/app/core/blocks/blocks-api.service.spec.ts` | Create | 3 HTTP tests |
| `frontend/src/app/features/contacts/contacts-home/contacts-home.ts` | Modify | Add `view` toggle + blocked list loading |
| `frontend/src/app/features/contacts/contacts-home/contacts-home.html` | Modify | Add Friends/Blocked tab toggle + blocked list |
| `frontend/src/app/features/workspace/workspace-shell.component.ts` | Modify | Add `myRooms` signal + `unreadCounts` exposure |
| `frontend/src/app/features/workspace/workspace-shell.component.html` | Modify | Replace static room list with `@for` + unread badges |
| `frontend/src/app/features/workspace/workspace-shell.component.spec.ts` | Modify | Update spec to inject `RoomsApiService` |

---

## Task 1: Platform Ban DTOs + PlatformBansEndpoints + Program.cs wiring

**Context:** The `PlatformBan` entity exists in `src/ChatHerder.Domain/Entities/PlatformBan.cs` with fields: `Id`, `UserId`, `IssuedByAdminId`, `Reason`, `CreatedAt`, `ExpiresAt` (null = permanent), `RevokedAt`. `AppDbContext.PlatformBans` is a `DbSet<PlatformBan>`. `BanCheckMiddleware` reads `ban:{userId}` from Redis using `IConnectionMultiplexer`. The ban endpoint must write/delete the same key. Existing DTOs live in `src/ChatHerder.Application/DTOs/`.

**Files:**
- Create: `src/ChatHerder.Application/DTOs/PlatformBanDtos.cs`
- Create: `src/ChatHerder.API/Endpoints/PlatformBansEndpoints.cs`
- Modify: `src/ChatHerder.API/Program.cs`
- Create: `tests/ChatHerder.Unit.Tests/Endpoints/PlatformBansEndpointsTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/ChatHerder.Unit.Tests/Endpoints/PlatformBansEndpointsTests.cs`:

```csharp
using ChatHerder.API.Endpoints;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using StackExchange.Redis;
using System.Security.Claims;

namespace ChatHerder.Unit.Tests.Endpoints;

public sealed class PlatformBansEndpointsTests
{
    private static AppDbContext BuildDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static (IConnectionMultiplexer redis, IDatabase redisDb) BuildRedisMock()
    {
        var redis = Substitute.For<IConnectionMultiplexer>();
        var db    = Substitute.For<IDatabase>();
        redis.GetDatabase(Arg.Any<int>(), Arg.Any<object?>()).Returns(db);
        return (redis, db);
    }

    private static ClaimsPrincipal Caller(Guid userId) =>
        new(new ClaimsIdentity([new Claim("user_id", userId.ToString())], "Test"));

    private static ClaimsPrincipal NoClaim() =>
        new(new ClaimsIdentity([], "Test"));

    [Fact]
    public async Task GetBans_Returns200_WithList()
    {
        var db        = BuildDb();
        var adminId   = Guid.NewGuid();
        var targetId  = Guid.NewGuid();
        var admin  = new User { Id = adminId,  Username = "admin",  Email = "a@x.com", PasswordHash = "h" };
        var target = new User { Id = targetId, Username = "target", Email = "t@x.com", PasswordHash = "h" };
        db.Users.AddRange(admin, target);
        db.PlatformBans.Add(new PlatformBan
            { UserId = targetId, IssuedByAdminId = adminId, Reason = "spam" });
        await db.SaveChangesAsync();

        var (redis, _) = BuildRedisMock();
        var result = await PlatformBansEndpoints.GetBansInternal(Caller(adminId), db, CancellationToken.None);

        var ok = Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Ok<List<ChatHerder.Application.DTOs.PlatformBanDto>>>(result);
        Assert.Single(ok.Value!);
        Assert.Equal("target", ok.Value[0].Username);
    }

    [Fact]
    public async Task IssueBan_Returns401_WhenNoClaim()
    {
        var db = BuildDb();
        var (redis, _) = BuildRedisMock();
        var result = await PlatformBansEndpoints.IssueBanInternal(
            new ChatHerder.Application.DTOs.IssuePlatformBanRequest("user", "spam", null),
            NoClaim(), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.UnauthorizedHttpResult>(result);
    }

    [Fact]
    public async Task IssueBan_Returns404_WhenUserNotFound()
    {
        var db        = BuildDb();
        var adminId   = Guid.NewGuid();
        var (redis, _) = BuildRedisMock();

        var result = await PlatformBansEndpoints.IssueBanInternal(
            new ChatHerder.Application.DTOs.IssuePlatformBanRequest("ghost", "spam", null),
            Caller(adminId), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.NotFound>(result);
    }

    [Fact]
    public async Task IssueBan_Returns204_AndSetsRedisKey()
    {
        var db        = BuildDb();
        var adminId   = Guid.NewGuid();
        var targetId  = Guid.NewGuid();
        var admin  = new User { Id = adminId,  Username = "admin",  Email = "a@x.com", PasswordHash = "h" };
        var target = new User { Id = targetId, Username = "target", Email = "t@x.com", PasswordHash = "h" };
        db.Users.AddRange(admin, target);
        await db.SaveChangesAsync();

        var (redis, redisDb) = BuildRedisMock();
        redisDb.StringSetAsync(Arg.Any<RedisKey>(), Arg.Any<RedisValue>(),
            Arg.Any<TimeSpan?>(), Arg.Any<When>(), Arg.Any<CommandFlags>())
            .Returns(Task.FromResult(true));

        var result = await PlatformBansEndpoints.IssueBanInternal(
            new ChatHerder.Application.DTOs.IssuePlatformBanRequest("target", "spam", 24),
            Caller(adminId), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.NoContent>(result);
        var ban = await db.PlatformBans.FirstOrDefaultAsync();
        Assert.NotNull(ban);
        Assert.Equal(targetId, ban.UserId);
        await redisDb.Received(1).StringSetAsync(
            $"ban:{targetId}", "1",
            Arg.Any<TimeSpan?>(), Arg.Any<When>(), Arg.Any<CommandFlags>());
    }

    [Fact]
    public async Task RevokeBan_Returns404_WhenNoActiveBan()
    {
        var db       = BuildDb();
        var adminId  = Guid.NewGuid();
        var (redis, _) = BuildRedisMock();

        var result = await PlatformBansEndpoints.RevokeBanInternal(
            Guid.NewGuid(), Caller(adminId), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.NotFound>(result);
    }

    [Fact]
    public async Task RevokeBan_Returns204_AndDeletesRedisKey()
    {
        var db       = BuildDb();
        var adminId  = Guid.NewGuid();
        var targetId = Guid.NewGuid();
        var admin  = new User { Id = adminId,  Username = "admin",  Email = "a@x.com", PasswordHash = "h" };
        var target = new User { Id = targetId, Username = "target", Email = "t@x.com", PasswordHash = "h" };
        db.Users.AddRange(admin, target);
        db.PlatformBans.Add(new PlatformBan
            { UserId = targetId, IssuedByAdminId = adminId, Reason = "spam", RevokedAt = null });
        await db.SaveChangesAsync();

        var (redis, redisDb) = BuildRedisMock();
        redisDb.KeyDeleteAsync(Arg.Any<RedisKey>(), Arg.Any<CommandFlags>())
            .Returns(Task.FromResult(true));

        var result = await PlatformBansEndpoints.RevokeBanInternal(
            targetId, Caller(adminId), db, redis, CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.NoContent>(result);
        var ban = await db.PlatformBans.FirstOrDefaultAsync();
        Assert.NotNull(ban?.RevokedAt);
        await redisDb.Received(1).KeyDeleteAsync($"ban:{targetId}", Arg.Any<CommandFlags>());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ChatHerder.Unit.Tests.csproj \
  --filter "FullyQualifiedName~PlatformBansEndpointsTests" -v n
```

Expected: BUILD FAILED — `PlatformBansEndpoints` and `PlatformBanDtos` types not found.

- [ ] **Step 3: Create `PlatformBanDtos.cs`**

Create `src/ChatHerder.Application/DTOs/PlatformBanDtos.cs`:

```csharp
namespace ChatHerder.Application.DTOs;

public sealed record IssuePlatformBanRequest(
    string Username,
    string Reason,
    int? DurationHours);   // null = permanent

public sealed record PlatformBanDto(
    Guid Id,
    Guid UserId,
    string Username,
    Guid IssuedByAdminId,
    string IssuedByAdminUsername,
    string Reason,
    DateTime CreatedAt,
    DateTime? ExpiresAt,
    DateTime? RevokedAt);
```

- [ ] **Step 4: Create `PlatformBansEndpoints.cs`**

Create `src/ChatHerder.API/Endpoints/PlatformBansEndpoints.cs`:

```csharp
using System.Security.Claims;
using ChatHerder.Application.DTOs;
using ChatHerder.Domain.Entities;
using ChatHerder.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

namespace ChatHerder.API.Endpoints;

public static class PlatformBansEndpoints
{
    public static RouteGroupBuilder MapPlatformBansEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("",               GetBans)   .RequireAuthorization();
        group.MapPost("",              IssueBan)  .RequireAuthorization();
        group.MapDelete("/{userId:guid}", RevokeBan).RequireAuthorization();
        return group;
    }

    internal static Task<IResult> GetBansInternal(
        ClaimsPrincipal p, AppDbContext db, CancellationToken ct)
        => GetBans(p, db, ct);

    internal static Task<IResult> IssueBanInternal(
        IssuePlatformBanRequest req, ClaimsPrincipal p, AppDbContext db,
        IConnectionMultiplexer redis, CancellationToken ct)
        => IssueBan(req, p, db, redis, ct);

    internal static Task<IResult> RevokeBanInternal(
        Guid userId, ClaimsPrincipal p, AppDbContext db,
        IConnectionMultiplexer redis, CancellationToken ct)
        => RevokeBan(userId, p, db, redis, ct);

    private static async Task<IResult> GetBans(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out _))
            return Results.Unauthorized();

        var bans = await db.PlatformBans
            .Include(b => b.User)
            .Include(b => b.IssuedByAdmin)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new PlatformBanDto(
                b.Id,
                b.UserId,
                b.User.Username,
                b.IssuedByAdminId,
                b.IssuedByAdmin.Username,
                b.Reason,
                b.CreatedAt,
                b.ExpiresAt,
                b.RevokedAt))
            .ToListAsync(ct);

        return Results.Ok(bans);
    }

    private static async Task<IResult> IssueBan(
        IssuePlatformBanRequest req,
        ClaimsPrincipal principal,
        AppDbContext db,
        IConnectionMultiplexer redis,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var adminId))
            return Results.Unauthorized();

        var target = await db.Users.FirstOrDefaultAsync(
            u => u.Username == req.Username && u.DeletedAt == null, ct);
        if (target is null) return Results.NotFound();

        DateTime? expiresAt = req.DurationHours.HasValue
            ? DateTime.UtcNow.AddHours(req.DurationHours.Value)
            : null;

        db.PlatformBans.Add(new PlatformBan
        {
            UserId          = target.Id,
            IssuedByAdminId = adminId,
            Reason          = req.Reason,
            ExpiresAt       = expiresAt,
        });
        await db.SaveChangesAsync(ct);

        var redisDb = redis.GetDatabase();
        var expiry  = expiresAt.HasValue ? expiresAt.Value - DateTime.UtcNow : (TimeSpan?)null;
        await redisDb.StringSetAsync($"ban:{target.Id}", "1", expiry, When.Always);

        return Results.NoContent();
    }

    private static async Task<IResult> RevokeBan(
        Guid userId,
        ClaimsPrincipal principal,
        AppDbContext db,
        IConnectionMultiplexer redis,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("user_id"), out var adminId))
            return Results.Unauthorized();

        var ban = await db.PlatformBans
            .FirstOrDefaultAsync(b => b.UserId == userId && b.RevokedAt == null, ct);
        if (ban is null) return Results.NotFound();

        ban.RevokedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await redis.GetDatabase().KeyDeleteAsync($"ban:{userId}");
        return Results.NoContent();
    }
}
```

- [ ] **Step 5: Register in Program.cs**

Open `src/ChatHerder.API/Program.cs`. After the `/files` line, add:

```csharp
api.MapGroup("/admin/bans").MapPlatformBansEndpoints();
```

The `/api` group block should now end with:
```csharp
api.MapGroup("/files").MapFilesEndpoints();
api.MapGroup("/admin/bans").MapPlatformBansEndpoints();
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
dotnet test tests/ChatHerder.Unit.Tests/ChatHerder.Unit.Tests.csproj \
  --filter "FullyQualifiedName~PlatformBansEndpointsTests" -v n
```

Expected: 6/6 PASS. Then run the full suite:

```bash
dotnet test tests/ChatHerder.Unit.Tests/ChatHerder.Unit.Tests.csproj -v n
```

Expected: all tests PASS, 0 regressions.

- [ ] **Step 7: Commit**

```bash
git add src/ChatHerder.Application/DTOs/PlatformBanDtos.cs \
        src/ChatHerder.API/Endpoints/PlatformBansEndpoints.cs \
        src/ChatHerder.API/Program.cs \
        tests/ChatHerder.Unit.Tests/Endpoints/PlatformBansEndpointsTests.cs
git commit -m "feat: platform ban REST endpoints GET/POST/DELETE /admin/bans (TDD)"
```

---

## Task 2: admin.models.ts + PlatformBansApiService

**Context:** Angular services follow the pattern in `frontend/src/app/core/friends/friends-api.service.ts` — `@Injectable({ providedIn: 'root' })`, `inject(HttpClient)`, `HttpTestingController` for tests. The backend endpoint is at `/api/admin/bans`. The `IssuePlatformBanRequest` body has `{ username: string, reason: string, durationHours: number | null }`. `GET /admin/bans` returns `PlatformBanDto[]`. `DELETE /admin/bans/{userId}` takes a `userId` GUID in the URL.

**Files:**
- Create: `frontend/src/app/core/admin/admin.models.ts`
- Create: `frontend/src/app/core/admin/platform-bans-api.service.ts`
- Create: `frontend/src/app/core/admin/platform-bans-api.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/core/admin/platform-bans-api.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PlatformBansApiService } from './platform-bans-api.service';

describe('PlatformBansApiService', () => {
  let service: PlatformBansApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PlatformBansApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlatformBansApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getBans() sends GET /api/admin/bans', () => {
    service.getBans().subscribe();
    const req = http.expectOne('/api/admin/bans');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('issueBan() sends POST /api/admin/bans with body', () => {
    service.issueBan('johndoe', 'spam', 24).subscribe();
    const req = http.expectOne('/api/admin/bans');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'johndoe', reason: 'spam', durationHours: 24 });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('revokeBan() sends DELETE /api/admin/bans/{userId}', () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000001';
    service.revokeBan(id).subscribe();
    const req = http.expectOne(`/api/admin/bans/${id}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npx ng test --include="src/app/core/admin/platform-bans-api.service.spec.ts" \
  --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — `PlatformBansApiService` not found.

- [ ] **Step 3: Create `admin.models.ts`**

Create `frontend/src/app/core/admin/admin.models.ts`:

```typescript
export interface PlatformBanDto {
  id: string;
  userId: string;
  username: string;
  issuedByAdminId: string;
  issuedByAdminUsername: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface IssuePlatformBanRequest {
  username: string;
  reason: string;
  durationHours: number | null;
}
```

- [ ] **Step 4: Create `platform-bans-api.service.ts`**

Create `frontend/src/app/core/admin/platform-bans-api.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { PlatformBanDto } from './admin.models';

@Injectable({ providedIn: 'root' })
export class PlatformBansApiService {
  private readonly http = inject(HttpClient);

  getBans(): Observable<PlatformBanDto[]> {
    return this.http.get<PlatformBanDto[]>('/api/admin/bans');
  }

  issueBan(username: string, reason: string, durationHours: number | null): Observable<void> {
    return this.http.post<void>('/api/admin/bans', { username, reason, durationHours });
  }

  revokeBan(userId: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/bans/${userId}`);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend
npx ng test --include="src/app/core/admin/platform-bans-api.service.spec.ts" \
  --watch=false --browsers=ChromeHeadless
```

Expected: 3/3 PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/admin/
git commit -m "feat: PlatformBansApiService + admin.models.ts"
```

---

## Task 3: Wire PlatformBansComponent

**Context:** The component lives at `/app/admin` route. The `.ts` is a stub (only injects `AuthSessionService`). The `.html` already has a pixel-perfect template with:
- A 4-field form (username text input, reason text input, duration select, submit button)
- An "Active Bans" table using `@for` over a **static inline array** — this must be replaced with real data
- A "Revoked Bans" collapsible section

The form submit button has no `(ngSubmit)` or `(click)` binding yet. The revoke button has no `(click)` binding. Active bans filter is `revokedAt === null`. The form duration select maps: "24 Hours" → 24, "7 Days" → 168, "30 Days" → 720, "Permanent" → null.

**Files:**
- Modify: `frontend/src/app/features/admin/platform-bans/platform-bans.ts`
- Modify: `frontend/src/app/features/admin/platform-bans/platform-bans.html`
- Modify: `frontend/src/app/features/admin/platform-bans/platform-bans.spec.ts`

- [ ] **Step 1: Rewrite `platform-bans.spec.ts` with meaningful tests**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PlatformBansComponent } from './platform-bans';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { signal } from '@angular/core';

describe('PlatformBansComponent', () => {
  let component: PlatformBansComponent;
  let fixture: ComponentFixture<PlatformBansComponent>;
  let http: HttpTestingController;

  const mockUser = { id: 'uid1', username: 'admin', email: 'a@x.com', avatarUrl: null };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformBansComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthSessionService,
          useValue: { user: signal(mockUser) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformBansComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create and load bans on init', async () => {
    fixture.detectChanges();
    const req = http.expectOne('/api/admin/bans');
    req.flush([]);
    await fixture.whenStable();
    expect(component).toBeTruthy();
    expect(component.bans().length).toBe(0);
  });

  it('activeBans() filters out revoked entries', () => {
    const now = new Date().toISOString();
    component.bans.set([
      { id: '1', userId: 'u1', username: 'alice', issuedByAdminId: 'a', issuedByAdminUsername: 'admin',
        reason: 'spam', createdAt: now, expiresAt: null, revokedAt: null },
      { id: '2', userId: 'u2', username: 'bob', issuedByAdminId: 'a', issuedByAdminUsername: 'admin',
        reason: 'troll', createdAt: now, expiresAt: null, revokedAt: now },
    ]);
    expect(component.activeBans().length).toBe(1);
    expect(component.activeBans()[0].username).toBe('alice');
  });

  it('revokedBans() returns only revoked entries', () => {
    const now = new Date().toISOString();
    component.bans.set([
      { id: '1', userId: 'u1', username: 'alice', issuedByAdminId: 'a', issuedByAdminUsername: 'admin',
        reason: 'spam', createdAt: now, expiresAt: null, revokedAt: null },
      { id: '2', userId: 'u2', username: 'bob', issuedByAdminId: 'a', issuedByAdminUsername: 'admin',
        reason: 'troll', createdAt: now, expiresAt: null, revokedAt: now },
    ]);
    expect(component.revokedBans().length).toBe(1);
    expect(component.revokedBans()[0].username).toBe('bob');
  });
});
```

- [ ] **Step 2: Run spec to verify it fails**

```bash
cd frontend
npx ng test --include="src/app/features/admin/platform-bans/platform-bans.spec.ts" \
  --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — `bans`, `activeBans`, `revokedBans` not found.

- [ ] **Step 3: Rewrite `platform-bans.ts`**

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { PlatformBansApiService } from '../../../core/admin/platform-bans-api.service';
import type { PlatformBanDto } from '../../../core/admin/admin.models';

@Component({
  selector: 'app-platform-bans',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './platform-bans.html',
  styleUrl: './platform-bans.scss',
})
export class PlatformBansComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly bansApi = inject(PlatformBansApiService);

  readonly user = this.authSession.user;

  readonly bans = signal<PlatformBanDto[]>([]);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');

  readonly activeBans = computed(() => this.bans().filter(b => b.revokedAt === null));
  readonly revokedBans = computed(() => this.bans().filter(b => b.revokedAt !== null));

  banUsername = '';
  banReason = '';
  banDuration = '24';   // matches <select> option values

  constructor() {
    this.loadBans();
  }

  issueBan(): void {
    if (!this.banUsername.trim() || !this.banReason.trim() || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    const durationHours = this.banDuration === 'permanent' ? null : Number(this.banDuration);
    this.bansApi.issueBan(this.banUsername.trim(), this.banReason.trim(), durationHours)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.banUsername = '';
          this.banReason   = '';
          this.banDuration = '24';
          this.loadBans();
        },
        error: () => this.errorMessage.set('Failed to issue ban. Check the username and try again.'),
      });
  }

  revokeBan(userId: string): void {
    this.errorMessage.set('');
    this.bansApi.revokeBan(userId).subscribe({
      next: () => this.loadBans(),
      error: () => this.errorMessage.set('Failed to revoke ban.'),
    });
  }

  private loadBans(): void {
    this.isLoading.set(true);
    this.bansApi.getBans()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: bans => this.bans.set(bans),
        error: () => this.errorMessage.set('Unable to load bans.'),
      });
  }
}
```

- [ ] **Step 4: Update `platform-bans.html`** — wire form, dynamic bans table, revoke button

Replace the form element and the two table sections with data-driven versions. Preserve all Tailwind classes exactly. Only change the parts shown below:

**Replace** the `<form>` opening tag and its 4 fields (lines 21–48 in the original template):
```html
<form class="grid grid-cols-1 md:grid-cols-4 gap-6 items-end" (ngSubmit)="issueBan()">
  <div class="col-span-1">
    <label class="block text-[11px] font-bold text-on-surface-variant mb-2 uppercase tracking-tight">Username</label>
    <div class="relative">
      <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">person</span>
      <input class="w-full bg-surface-container-low border-none rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 placeholder-outline-variant"
             placeholder="Search by username..." type="text" [(ngModel)]="banUsername" name="banUsername" />
    </div>
  </div>
  <div class="col-span-1">
    <label class="block text-[11px] font-bold text-on-surface-variant mb-2 uppercase tracking-tight">Ban Reason (Required)</label>
    <input class="w-full bg-surface-container-low border-none rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 placeholder-outline-variant"
           placeholder="Ban reason (required)" type="text" [(ngModel)]="banReason" name="banReason" />
  </div>
  <div class="col-span-1">
    <label class="block text-[11px] font-bold text-on-surface-variant mb-2 uppercase tracking-tight">Duration</label>
    <select class="w-full bg-surface-container-low border-none rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-primary/20"
            [(ngModel)]="banDuration" name="banDuration">
      <option value="24">24 Hours</option>
      <option value="168">7 Days</option>
      <option value="720">30 Days</option>
      <option value="permanent">Permanent</option>
    </select>
  </div>
  <div class="col-span-1">
    <button class="w-full bg-primary text-on-primary font-semibold py-2.5 rounded-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            type="submit" [disabled]="isSubmitting()">
      <span class="material-symbols-outlined text-sm">gavel</span>
      <span>{{ isSubmitting() ? 'Issuing...' : 'Issue Ban' }}</span>
    </button>
  </div>
</form>
```

**Replace** the `<tbody>` content (the static `@for` over the inline array) with:
```html
<tbody class="divide-y divide-surface-container">
  @if (isLoading()) {
    <tr><td colspan="6" class="px-8 py-5 text-center text-on-surface-variant text-sm">Loading...</td></tr>
  } @else if (activeBans().length === 0) {
    <tr><td colspan="6" class="px-8 py-5 text-center text-on-surface-variant text-sm">No active bans.</td></tr>
  } @else {
    @for (ban of activeBans(); track ban.id) {
      <tr class="hover:bg-surface-container-low transition-colors">
        <td class="px-8 py-5">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-xs font-bold text-primary">
              {{ ban.username.slice(0, 2).toUpperCase() }}
            </div>
            <span class="text-sm font-semibold text-on-surface">{{ ban.username }}</span>
          </div>
        </td>
        <td class="px-8 py-5"><span class="text-sm text-on-surface-variant">{{ ban.issuedByAdminUsername }}</span></td>
        <td class="px-8 py-5"><span class="text-sm text-on-surface-variant">{{ ban.reason }}</span></td>
        <td class="px-8 py-5"><span class="text-sm text-on-surface-variant">{{ ban.createdAt | date:'MMM d, y' }}</span></td>
        <td class="px-8 py-5">
          @if (ban.expiresAt) {
            <span class="text-sm text-on-surface-variant">{{ ban.expiresAt | date:'MMM d, y' }}</span>
          } @else {
            <span class="text-sm font-bold text-error">Permanent</span>
          }
        </td>
        <td class="px-8 py-5 text-right">
          <button class="text-[11px] font-bold text-primary hover:bg-primary-container px-3 py-1.5 rounded-lg transition-all"
                  (click)="revokeBan(ban.userId)">Revoke</button>
        </td>
      </tr>
    }
  }
</tbody>
```

Also **replace** the revoked bans count badge `12 Total` with a dynamic count:
```html
<span class="text-[10px] font-black bg-outline-variant/20 px-2 py-0.5 rounded uppercase">{{ revokedBans().length }} Total</span>
```

Also **replace** the active bans count badge `4` in the header:
```html
<span class="bg-primary-container text-on-primary-container text-[11px] font-black px-2.5 py-0.5 rounded-full">{{ activeBans().length }}</span>
```

Add `DatePipe` to imports in `platform-bans.ts` and add it to the `@Component` imports array:
```typescript
import { DatePipe } from '@angular/common';
// in @Component:
imports: [FormsModule, DatePipe],
```

Also add an error banner just before the `<!-- Active Bans Table -->` section:
```html
@if (errorMessage()) {
  <p class="text-error text-sm bg-error-container/20 border border-error/20 rounded-xl px-4 py-3 -mt-4">{{ errorMessage() }}</p>
}
```

- [ ] **Step 5: Run full Angular test suite**

```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
```

Expected: all tests PASS including the 3 new PlatformBansComponent tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/admin/platform-bans/
git commit -m "feat: wire PlatformBansComponent to PlatformBansApiService"
```

---

## Task 4: rooms.models.ts additions + RoomsAdminApiService

**Context:** `frontend/src/app/core/rooms/rooms.models.ts` already has `RoomDto`, `RoomMemberDto`, `RoomCatalogItem`, `CreateRoomRequest`. It is missing `RoomBanDto`, `RoomInvitationDto`, and `UpdateRoomRequest`. The backend DTOs are in `src/ChatHerder.Application/DTOs/RoomDtos.cs` — field names match (camelCase on Angular side). `RoomsApiService` already has `getMembers(id)`. The new `RoomsAdminApiService` handles admin-only operations on separate methods to avoid bloating the existing service.

**Files:**
- Modify: `frontend/src/app/core/rooms/rooms.models.ts`
- Create: `frontend/src/app/core/rooms/rooms-admin-api.service.ts`
- Create: `frontend/src/app/core/rooms/rooms-admin-api.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/core/rooms/rooms-admin-api.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RoomsAdminApiService } from './rooms-admin-api.service';

describe('RoomsAdminApiService', () => {
  let service: RoomsAdminApiService;
  let http: HttpTestingController;

  const roomId = 'aaaaaaaa-0000-0000-0000-000000000001';
  const userId = 'bbbbbbbb-0000-0000-0000-000000000002';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RoomsAdminApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RoomsAdminApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getBans() sends GET /api/rooms/{id}/bans', () => {
    service.getBans(roomId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/bans`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('banMember() sends POST /api/rooms/{id}/members/{userId}/ban', () => {
    service.banMember(roomId, userId, 'spam').subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/members/${userId}/ban`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'spam' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('unbanMember() sends DELETE /api/rooms/{id}/bans/{userId}', () => {
    service.unbanMember(roomId, userId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/bans/${userId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('makeAdmin() sends POST /api/rooms/{id}/members/{userId}/make-admin', () => {
    service.makeAdmin(roomId, userId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/members/${userId}/make-admin`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('demoteAdmin() sends DELETE /api/rooms/{id}/members/{userId}/admin', () => {
    service.demoteAdmin(roomId, userId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/members/${userId}/admin`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('getInvitations() sends GET /api/rooms/{id}/invitations', () => {
    service.getInvitations(roomId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/invitations`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('sendInvitation() sends POST /api/rooms/{id}/invitations with username', () => {
    service.sendInvitation(roomId, 'alice').subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/invitations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'alice' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('updateRoom() sends PATCH /api/rooms/{id}', () => {
    service.updateRoom(roomId, { name: 'new-name', description: null, visibility: null }).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'new-name', description: null, visibility: null });
    req.flush({});
  });

  it('deleteRoom() sends DELETE /api/rooms/{id}', () => {
    service.deleteRoom(roomId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npx ng test --include="src/app/core/rooms/rooms-admin-api.service.spec.ts" \
  --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — `RoomsAdminApiService` not found.

- [ ] **Step 3: Add missing types to `rooms.models.ts`**

Append to the end of `frontend/src/app/core/rooms/rooms.models.ts`:

```typescript
export interface RoomBanDto {
  bannedUserId: string;
  bannedUsername: string;
  bannedByUserId: string;
  bannedByUsername: string;
  reason: string | null;
  createdAt: string;
}

export interface RoomInvitationDto {
  id: string;
  roomId: string;
  roomName: string;
  invitedByUserId: string;
  invitedByUsername: string;
  invitedUserId: string;
  invitedUsername: string;
  status: string;
  createdAt: string;
}

export interface UpdateRoomRequest {
  name: string | null;
  description: string | null;
  visibility: 'Public' | 'Private' | null;
}
```

- [ ] **Step 4: Create `rooms-admin-api.service.ts`**

Create `frontend/src/app/core/rooms/rooms-admin-api.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { RoomBanDto, RoomDto, RoomInvitationDto, UpdateRoomRequest } from './rooms.models';

@Injectable({ providedIn: 'root' })
export class RoomsAdminApiService {
  private readonly http = inject(HttpClient);

  getBans(roomId: string): Observable<RoomBanDto[]> {
    return this.http.get<RoomBanDto[]>(`/api/rooms/${roomId}/bans`);
  }

  banMember(roomId: string, userId: string, reason: string): Observable<void> {
    return this.http.post<void>(`/api/rooms/${roomId}/members/${userId}/ban`, { reason });
  }

  unbanMember(roomId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`/api/rooms/${roomId}/bans/${userId}`);
  }

  makeAdmin(roomId: string, userId: string): Observable<void> {
    return this.http.post<void>(`/api/rooms/${roomId}/members/${userId}/make-admin`, {});
  }

  demoteAdmin(roomId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`/api/rooms/${roomId}/members/${userId}/admin`);
  }

  getInvitations(roomId: string): Observable<RoomInvitationDto[]> {
    return this.http.get<RoomInvitationDto[]>(`/api/rooms/${roomId}/invitations`);
  }

  sendInvitation(roomId: string, username: string): Observable<void> {
    return this.http.post<void>(`/api/rooms/${roomId}/invitations`, { username });
  }

  updateRoom(roomId: string, req: UpdateRoomRequest): Observable<RoomDto> {
    return this.http.patch<RoomDto>(`/api/rooms/${roomId}`, req);
  }

  deleteRoom(roomId: string): Observable<void> {
    return this.http.delete<void>(`/api/rooms/${roomId}`);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend
npx ng test --include="src/app/core/rooms/rooms-admin-api.service.spec.ts" \
  --watch=false --browsers=ChromeHeadless
```

Expected: 9/9 PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/rooms/
git commit -m "feat: RoomsAdminApiService + RoomBanDto/RoomInvitationDto/UpdateRoomRequest types"
```

---

## Task 5: Wire ManageRoomComponent (5-tab modal)

**Context:** Route is `/app/rooms/:id/manage`. The existing `manage-room.html` has a left sidebar with 5 static nav items (Members selected) and a main area showing a static member list. The `.ts` is a stub. The route param is `id` from `ActivatedRoute`. `RoomsApiService.getMembers(id)` returns `RoomMemberDto[]`. `RoomsAdminApiService` provides the admin operations. `RoomsApiService.getRoom(id)` returns `RoomDto`. The owner can do all actions; admin can ban/unban/invite but not make/demote admins (that is owner-only).

**Files:**
- Modify: `frontend/src/app/features/rooms/manage-room/manage-room.ts`
- Modify: `frontend/src/app/features/rooms/manage-room/manage-room.html`
- Modify: `frontend/src/app/features/rooms/manage-room/manage-room.spec.ts`

- [ ] **Step 1: Rewrite `manage-room.spec.ts`**

```typescript
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { ManageRoomComponent } from './manage-room';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

describe('ManageRoomComponent', () => {
  let component: ManageRoomComponent;
  let fixture: ComponentFixture<ManageRoomComponent>;
  let http: HttpTestingController;

  const roomId = 'aaaaaaaa-0000-0000-0000-000000000001';
  const mockUser = { id: 'uid1', username: 'admin', email: 'a@x.com', avatarUrl: null };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageRoomComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: { user: signal(mockUser) } },
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id: roomId } } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManageRoomComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create with members tab active by default', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}`).flush({ id: roomId, name: 'Test', description: null,
      visibility: 'Public', ownerId: 'uid1', createdAt: '', memberCount: 1, callerRole: 'Owner' });
    http.expectOne(`/api/rooms/${roomId}/members`).flush([]);
    tick();
    expect(component.activeTab()).toBe('members');
  }));

  it('should load bans when switching to banned tab', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}`).flush({ id: roomId, name: 'Test', description: null,
      visibility: 'Public', ownerId: 'uid1', createdAt: '', memberCount: 1, callerRole: 'Owner' });
    http.expectOne(`/api/rooms/${roomId}/members`).flush([]);
    tick();

    component.switchTab('banned');
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}/bans`).flush([]);
    tick();
    expect(component.activeTab()).toBe('banned');
    expect(component.bans().length).toBe(0);
  }));

  it('should load invitations when switching to invitations tab', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}`).flush({ id: roomId, name: 'Test', description: null,
      visibility: 'Public', ownerId: 'uid1', createdAt: '', memberCount: 1, callerRole: 'Owner' });
    http.expectOne(`/api/rooms/${roomId}/members`).flush([]);
    tick();

    component.switchTab('invitations');
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}/invitations`).flush([]);
    tick();
    expect(component.activeTab()).toBe('invitations');
  }));

  it('admins() computed returns only Admin-role members', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}`).flush({ id: roomId, name: 'Test', description: null,
      visibility: 'Public', ownerId: 'uid1', createdAt: '', memberCount: 2, callerRole: 'Owner' });
    http.expectOne(`/api/rooms/${roomId}/members`).flush([
      { userId: 'u1', username: 'alice', avatarUrl: null, role: 'Admin', joinedAt: '', presenceStatus: 'online' },
      { userId: 'u2', username: 'bob',   avatarUrl: null, role: 'Member', joinedAt: '', presenceStatus: 'offline' },
    ]);
    tick();
    expect(component.admins().length).toBe(1);
    expect(component.admins()[0].username).toBe('alice');
  }));
});
```

- [ ] **Step 2: Run spec to verify it fails**

```bash
cd frontend
npx ng test --include="src/app/features/rooms/manage-room/manage-room.spec.ts" \
  --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — `activeTab`, `bans`, `admins`, `switchTab` not found.

- [ ] **Step 3: Rewrite `manage-room.ts`**

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { RoomsAdminApiService } from '../../../core/rooms/rooms-admin-api.service';
import type { RoomDto, RoomMemberDto, RoomBanDto, RoomInvitationDto } from '../../../core/rooms/rooms.models';

type Tab = 'members' | 'admins' | 'banned' | 'invitations' | 'settings';

@Component({
  selector: 'app-manage-room',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './manage-room.html',
  styleUrl: './manage-room.scss',
})
export class ManageRoomComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authSession = inject(AuthSessionService);
  private readonly roomsApi = inject(RoomsApiService);
  private readonly adminApi = inject(RoomsAdminApiService);

  readonly user = this.authSession.user;
  readonly roomId = this.route.snapshot.params['id'] as string;

  readonly activeTab = signal<Tab>('members');
  readonly room = signal<RoomDto | null>(null);
  readonly members = signal<RoomMemberDto[]>([]);
  readonly bans = signal<RoomBanDto[]>([]);
  readonly invitations = signal<RoomInvitationDto[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly admins = computed(() => this.members().filter(m => m.role === 'Admin'));

  editName = '';
  editDescription = '';
  editVisibility: 'Public' | 'Private' = 'Public';
  inviteUsername = '';

  ngOnInit(): void {
    this.roomsApi.getRoom(this.roomId).subscribe({
      next: room => {
        this.room.set(room);
        this.editName = room.name;
        this.editDescription = room.description ?? '';
        this.editVisibility = room.visibility;
      },
    });
    this.loadMembers();
  }

  switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    this.errorMessage.set('');
    if (tab === 'banned' && this.bans().length === 0) this.loadBans();
    if (tab === 'invitations' && this.invitations().length === 0) this.loadInvitations();
  }

  banMember(userId: string): void {
    this.adminApi.banMember(this.roomId, userId, 'Removed by admin').subscribe({
      next: () => this.loadMembers(),
      error: () => this.errorMessage.set('Failed to ban member.'),
    });
  }

  unbanMember(userId: string): void {
    this.adminApi.unbanMember(this.roomId, userId).subscribe({
      next: () => { this.loadBans(); this.loadMembers(); },
      error: () => this.errorMessage.set('Failed to unban member.'),
    });
  }

  makeAdmin(userId: string): void {
    this.adminApi.makeAdmin(this.roomId, userId).subscribe({
      next: () => this.loadMembers(),
      error: () => this.errorMessage.set('Failed to make admin.'),
    });
  }

  demoteAdmin(userId: string): void {
    this.adminApi.demoteAdmin(this.roomId, userId).subscribe({
      next: () => this.loadMembers(),
      error: () => this.errorMessage.set('Failed to demote admin.'),
    });
  }

  sendInvitation(): void {
    if (!this.inviteUsername.trim()) return;
    this.adminApi.sendInvitation(this.roomId, this.inviteUsername.trim()).subscribe({
      next: () => {
        this.inviteUsername = '';
        this.loadInvitations();
      },
      error: () => this.errorMessage.set('Failed to send invitation. Check the username.'),
    });
  }

  saveSettings(): void {
    this.adminApi.updateRoom(this.roomId, {
      name:        this.editName.trim() || null,
      description: this.editDescription.trim() || null,
      visibility:  this.editVisibility,
    }).subscribe({
      next: room => this.room.set(room),
      error: () => this.errorMessage.set('Failed to save settings.'),
    });
  }

  deleteRoom(): void {
    if (!confirm(`Delete room "${this.room()?.name}"? This cannot be undone.`)) return;
    this.adminApi.deleteRoom(this.roomId).subscribe({
      next: () => void this.router.navigateByUrl('/app/rooms'),
      error: () => this.errorMessage.set('Failed to delete room.'),
    });
  }

  close(): void {
    void this.router.navigateByUrl(`/app/rooms/${this.roomId}`);
  }

  private loadMembers(): void {
    this.isLoading.set(true);
    this.roomsApi.getMembers(this.roomId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({ next: m => this.members.set(m) });
  }

  private loadBans(): void {
    this.adminApi.getBans(this.roomId).subscribe({ next: b => this.bans.set(b) });
  }

  private loadInvitations(): void {
    this.adminApi.getInvitations(this.roomId).subscribe({ next: i => this.invitations.set(i) });
  }
}
```

- [ ] **Step 4: Rewrite `manage-room.html`** — complete data-driven template with all 5 tab views

Replace the entire contents of `frontend/src/app/features/rooms/manage-room/manage-room.html`:

```html
<div class="flex h-full bg-surface-container-lowest overflow-hidden">
  <!-- Side Navigation -->
  <aside class="bg-surface-container-low flex flex-col h-full w-64 border-r border-surface-container shrink-0">
    <div class="p-6">
      <h3 class="text-base font-bold text-on-surface mb-1">{{ room()?.name ?? 'Room' }}</h3>
      <p class="text-sm text-outline">Admin Managed</p>
    </div>
    <nav class="flex-1 px-3 space-y-1">
      <div class="flex items-center gap-3 py-2 pl-3 cursor-pointer transition-all duration-200 rounded-lg"
           [class.text-on-surface]="activeTab() === 'members'"
           [class.border-l-4]="activeTab() === 'members'"
           [class.border-primary]="activeTab() === 'members'"
           [class.pl-2]="activeTab() === 'members'"
           [class.bg-surface-container-high]="activeTab() === 'members'"
           [class.font-semibold]="activeTab() === 'members'"
           [class.text-on-surface-variant]="activeTab() !== 'members'"
           [class.hover\:text-on-surface]="activeTab() !== 'members'"
           [class.hover\:bg-surface-container]="activeTab() !== 'members'"
           (click)="switchTab('members')">
        <span class="material-symbols-outlined" [style.font-variation-settings]="activeTab()==='members' ? \"'FILL' 1\" : ''">group</span>
        <span class="text-sm font-medium">Members</span>
      </div>
      <div class="flex items-center gap-3 py-2 pl-3 cursor-pointer transition-all duration-200 rounded-lg"
           [class.text-on-surface]="activeTab() === 'admins'"
           [class.border-l-4]="activeTab() === 'admins'"
           [class.border-primary]="activeTab() === 'admins'"
           [class.pl-2]="activeTab() === 'admins'"
           [class.bg-surface-container-high]="activeTab() === 'admins'"
           [class.font-semibold]="activeTab() === 'admins'"
           [class.text-on-surface-variant]="activeTab() !== 'admins'"
           (click)="switchTab('admins')">
        <span class="material-symbols-outlined">shield_person</span>
        <span class="text-sm font-medium">Admins</span>
      </div>
      <div class="flex items-center gap-3 py-2 pl-3 cursor-pointer transition-all duration-200 rounded-lg"
           [class.text-on-surface]="activeTab() === 'banned'"
           [class.border-l-4]="activeTab() === 'banned'"
           [class.border-primary]="activeTab() === 'banned'"
           [class.pl-2]="activeTab() === 'banned'"
           [class.bg-surface-container-high]="activeTab() === 'banned'"
           [class.font-semibold]="activeTab() === 'banned'"
           [class.text-on-surface-variant]="activeTab() !== 'banned'"
           (click)="switchTab('banned')">
        <span class="material-symbols-outlined">block</span>
        <span class="text-sm font-medium">Banned users</span>
      </div>
      <div class="flex items-center gap-3 py-2 pl-3 cursor-pointer transition-all duration-200 rounded-lg"
           [class.text-on-surface]="activeTab() === 'invitations'"
           [class.border-l-4]="activeTab() === 'invitations'"
           [class.border-primary]="activeTab() === 'invitations'"
           [class.pl-2]="activeTab() === 'invitations'"
           [class.bg-surface-container-high]="activeTab() === 'invitations'"
           [class.font-semibold]="activeTab() === 'invitations'"
           [class.text-on-surface-variant]="activeTab() !== 'invitations'"
           (click)="switchTab('invitations')">
        <span class="material-symbols-outlined">mail</span>
        <span class="text-sm font-medium">Invitations</span>
      </div>
      <div class="flex items-center gap-3 py-2 pl-3 cursor-pointer transition-all duration-200 rounded-lg"
           [class.text-on-surface]="activeTab() === 'settings'"
           [class.border-l-4]="activeTab() === 'settings'"
           [class.border-primary]="activeTab() === 'settings'"
           [class.pl-2]="activeTab() === 'settings'"
           [class.bg-surface-container-high]="activeTab() === 'settings'"
           [class.font-semibold]="activeTab() === 'settings'"
           [class.text-on-surface-variant]="activeTab() !== 'settings'"
           (click)="switchTab('settings')">
        <span class="material-symbols-outlined">settings</span>
        <span class="text-sm font-medium">Settings</span>
      </div>
    </nav>
    <div class="p-6 border-t border-surface-container">
      <button class="w-full text-left flex items-center gap-2 text-error hover:bg-error/5 p-2 rounded-lg transition-colors"
              (click)="deleteRoom()">
        <span class="material-symbols-outlined text-sm">delete</span>
        <span class="text-sm font-semibold">Delete room</span>
      </button>
    </div>
  </aside>

  <!-- Main Content Area -->
  <section class="flex-1 flex flex-col min-w-0 bg-surface-container-lowest">
    <!-- Header -->
    <header class="px-8 pt-8 pb-4 flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-on-surface tracking-tight">#{{ room()?.name }}</h2>
        <p class="text-sm text-outline font-medium">Manage members and permissions</p>
      </div>
      <button class="p-2 hover:bg-surface-container rounded-full transition-colors text-outline"
              (click)="close()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </header>

    @if (errorMessage()) {
      <div class="mx-8 mb-2">
        <p class="text-error text-sm bg-error-container/20 border border-error/20 rounded-xl px-4 py-3">{{ errorMessage() }}</p>
      </div>
    }

    <!-- ── Members Tab ─────────────────────────────────── -->
    @if (activeTab() === 'members') {
      <div class="px-8 py-4">
        <div class="relative">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
          <input class="w-full bg-surface-container-low border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary/30 transition-all outline-none"
                 placeholder="Search members..." type="text" />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div class="space-y-2 pb-8">
          @if (isLoading()) {
            <div class="flex justify-center py-8">
              <span class="material-symbols-outlined text-2xl text-outline animate-spin">progress_activity</span>
            </div>
          } @else if (members().length === 0) {
            <p class="text-center text-on-surface-variant text-sm py-8">No members.</p>
          } @else {
            @for (member of members(); track member.userId) {
              <div class="flex items-center justify-between p-4 bg-surface-container-low/50 hover:bg-surface-container-low rounded-xl transition-colors group">
                <div class="flex items-center gap-3">
                  <div class="relative">
                    @if (member.avatarUrl) {
                      <img [src]="member.avatarUrl" class="w-10 h-10 rounded-full object-cover" alt="" />
                    } @else {
                      <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center">
                        <span class="material-symbols-outlined text-on-surface-variant">person</span>
                      </div>
                    }
                    <span class="absolute bottom-0 right-0 w-3 h-3 border-2 border-surface-container-lowest rounded-full"
                          [style.background-color]="member.presenceStatus === 'online' ? '#4caf50' : member.presenceStatus === 'afk' ? '#ffb300' : '#717c82'"></span>
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <h4 class="text-sm font-semibold text-on-surface">{{ member.username }}</h4>
                      @if (member.role === 'Admin') {
                        <span class="px-1.5 py-0.5 bg-primary-fixed text-on-primary-fixed text-[10px] font-bold rounded uppercase tracking-wider">Admin</span>
                      }
                      @if (member.role === 'Owner') {
                        <span class="px-1.5 py-0.5 bg-secondary-container text-on-secondary-container text-[10px] font-bold rounded uppercase tracking-wider">Owner</span>
                      }
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  @if (member.role === 'Member' && room()?.callerRole === 'Owner') {
                    <button class="px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 rounded-md transition-colors"
                            (click)="makeAdmin(member.userId)">Make admin</button>
                  }
                  @if (member.role === 'Admin' && room()?.callerRole === 'Owner') {
                    <button class="px-3 py-1.5 text-xs font-semibold text-outline hover:bg-surface-variant rounded-md transition-colors"
                            (click)="demoteAdmin(member.userId)">Demote</button>
                  }
                  @if (member.role !== 'Owner' && (room()?.callerRole === 'Owner' || room()?.callerRole === 'Admin')) {
                    <button class="px-3 py-1.5 text-xs font-semibold text-outline hover:bg-surface-variant rounded-md transition-colors"
                            (click)="banMember(member.userId)">Ban</button>
                  }
                </div>
              </div>
            }
          }
        </div>
      </div>
    }

    <!-- ── Admins Tab ──────────────────────────────────── -->
    @if (activeTab() === 'admins') {
      <div class="flex-1 overflow-y-auto px-8 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div class="space-y-2 pb-8">
          @if (admins().length === 0) {
            <p class="text-center text-on-surface-variant text-sm py-8">No admins yet.</p>
          } @else {
            @for (admin of admins(); track admin.userId) {
              <div class="flex items-center justify-between p-4 bg-surface-container-low/50 hover:bg-surface-container-low rounded-xl transition-colors group">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center">
                    <span class="material-symbols-outlined text-on-surface-variant">shield_person</span>
                  </div>
                  <h4 class="text-sm font-semibold text-on-surface">{{ admin.username }}</h4>
                </div>
                @if (room()?.callerRole === 'Owner' && admin.userId !== user()?.id) {
                  <button class="px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/5 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                          (click)="demoteAdmin(admin.userId)">Demote</button>
                }
              </div>
            }
          }
        </div>
      </div>
    }

    <!-- ── Banned Tab ─────────────────────────────────── -->
    @if (activeTab() === 'banned') {
      <div class="flex-1 overflow-y-auto px-8 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div class="space-y-2 pb-8">
          @if (bans().length === 0) {
            <p class="text-center text-on-surface-variant text-sm py-8">No banned users.</p>
          } @else {
            @for (ban of bans(); track ban.bannedUserId) {
              <div class="flex items-center justify-between p-4 bg-surface-container-low/50 hover:bg-surface-container-low rounded-xl transition-colors group">
                <div>
                  <h4 class="text-sm font-semibold text-on-surface">{{ ban.bannedUsername }}</h4>
                  <p class="text-xs text-outline">Banned by {{ ban.bannedByUsername }}@if (ban.reason) { — {{ ban.reason }} }</p>
                </div>
                <button class="px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                        (click)="unbanMember(ban.bannedUserId)">Unban</button>
              </div>
            }
          }
        </div>
      </div>
    }

    <!-- ── Invitations Tab ────────────────────────────── -->
    @if (activeTab() === 'invitations') {
      <div class="flex-1 overflow-y-auto px-8 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div class="mb-6 flex gap-3">
          <input class="flex-1 bg-surface-container-low border-none rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-primary/30 outline-none"
                 placeholder="Username to invite..." [(ngModel)]="inviteUsername" />
          <button class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
                  (click)="sendInvitation()">Invite</button>
        </div>
        <div class="space-y-2 pb-8">
          @if (invitations().length === 0) {
            <p class="text-center text-on-surface-variant text-sm py-4">No pending invitations.</p>
          } @else {
            @for (inv of invitations(); track inv.id) {
              <div class="flex items-center justify-between p-4 bg-surface-container-low/50 rounded-xl">
                <div>
                  <h4 class="text-sm font-semibold text-on-surface">{{ inv.invitedUsername }}</h4>
                  <p class="text-xs text-outline">Invited by {{ inv.invitedByUsername }}</p>
                </div>
                <span class="text-xs text-outline">{{ inv.status }}</span>
              </div>
            }
          }
        </div>
      </div>
    }

    <!-- ── Settings Tab ───────────────────────────────── -->
    @if (activeTab() === 'settings') {
      <div class="flex-1 overflow-y-auto px-8 py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div class="max-w-lg space-y-6">
          <div>
            <label class="block text-[11px] font-bold text-on-surface-variant mb-2 uppercase tracking-tight">Room Name</label>
            <input class="w-full bg-surface-container-low border-none rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary/30 outline-none"
                   [(ngModel)]="editName" />
          </div>
          <div>
            <label class="block text-[11px] font-bold text-on-surface-variant mb-2 uppercase tracking-tight">Description</label>
            <textarea class="w-full bg-surface-container-low border-none rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary/30 outline-none resize-none"
                      rows="3" [(ngModel)]="editDescription"></textarea>
          </div>
          <div>
            <label class="block text-[11px] font-bold text-on-surface-variant mb-2 uppercase tracking-tight">Visibility</label>
            <select class="w-full bg-surface-container-low border-none rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary/30 outline-none"
                    [(ngModel)]="editVisibility">
              <option value="Public">Public</option>
              <option value="Private">Private</option>
            </select>
          </div>
          <button class="px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity"
                  (click)="saveSettings()">Save changes</button>
        </div>
      </div>
    }

    <!-- Footer (Members tab only) -->
    @if (activeTab() === 'members') {
      <footer class="p-6 border-t border-surface-container bg-surface-container-low/50 flex justify-end gap-3">
        <button class="px-6 py-2 text-sm font-bold text-on-surface hover:bg-surface-container rounded-lg transition-colors"
                (click)="close()">Cancel</button>
      </footer>
    }
  </section>
</div>
```

- [ ] **Step 5: Run full Angular test suite**

```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
```

Expected: all tests PASS including 4 new ManageRoomComponent tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/rooms/manage-room/
git commit -m "feat: wire ManageRoomComponent — 5-tab modal with live data and admin actions"
```

---

## Task 6: BlocksApiService + unblock action in ContactsHomeComponent

**Context:** The backend `GET /blocks` returns `BlockDto[]` `{ blockedUserId, blockedUsername, avatarUrl, createdAt }` (from `src/ChatHerder.API/Endpoints/BlocksEndpoints.cs`). `POST /blocks { userId }` blocks a user. `DELETE /blocks/{userId}` unblocks. The existing `ContactsHomeComponent` has a friends grid on the left and a right sidebar with pending requests. Add a `view` signal `('friends' | 'blocked')` and a tab toggle to show the blocked users list. The blocked user card uses the same grid card style as friend cards.

**Files:**
- Create: `frontend/src/app/core/blocks/blocks.models.ts`
- Create: `frontend/src/app/core/blocks/blocks-api.service.ts`
- Create: `frontend/src/app/core/blocks/blocks-api.service.spec.ts`
- Modify: `frontend/src/app/features/contacts/contacts-home/contacts-home.ts`
- Modify: `frontend/src/app/features/contacts/contacts-home/contacts-home.html`

- [ ] **Step 1: Write the failing service tests**

Create `frontend/src/app/core/blocks/blocks-api.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BlocksApiService } from './blocks-api.service';

describe('BlocksApiService', () => {
  let service: BlocksApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BlocksApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BlocksApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getBlocks() sends GET /api/blocks', () => {
    service.getBlocks().subscribe();
    const req = http.expectOne('/api/blocks');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('blockUser() sends POST /api/blocks with userId', () => {
    service.blockUser('uid-123').subscribe();
    const req = http.expectOne('/api/blocks');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'uid-123' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('unblockUser() sends DELETE /api/blocks/{userId}', () => {
    service.unblockUser('uid-123').subscribe();
    const req = http.expectOne('/api/blocks/uid-123');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npx ng test --include="src/app/core/blocks/blocks-api.service.spec.ts" \
  --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — `BlocksApiService` not found.

- [ ] **Step 3: Create `blocks.models.ts`**

Create `frontend/src/app/core/blocks/blocks.models.ts`:

```typescript
export interface BlockDto {
  blockedUserId: string;
  blockedUsername: string;
  avatarUrl: string | null;
  createdAt: string;
}
```

- [ ] **Step 4: Create `blocks-api.service.ts`**

Create `frontend/src/app/core/blocks/blocks-api.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { BlockDto } from './blocks.models';

@Injectable({ providedIn: 'root' })
export class BlocksApiService {
  private readonly http = inject(HttpClient);

  getBlocks(): Observable<BlockDto[]> {
    return this.http.get<BlockDto[]>('/api/blocks');
  }

  blockUser(userId: string): Observable<void> {
    return this.http.post<void>('/api/blocks', { userId });
  }

  unblockUser(userId: string): Observable<void> {
    return this.http.delete<void>(`/api/blocks/${userId}`);
  }
}
```

- [ ] **Step 5: Run service tests to verify they pass**

```bash
cd frontend
npx ng test --include="src/app/core/blocks/blocks-api.service.spec.ts" \
  --watch=false --browsers=ChromeHeadless
```

Expected: 3/3 PASS.

- [ ] **Step 6: Update `ContactsHomeComponent.ts`** — add `view` toggle and blocked loading

Replace the full content of `contacts-home.ts`:

```typescript
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FriendsApiService } from '../../../core/friends/friends-api.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import { BlocksApiService } from '../../../core/blocks/blocks-api.service';
import type { FriendDto } from '../../../core/friends/friends.models';
import type { BlockDto } from '../../../core/blocks/blocks.models';

@Component({
  selector: 'app-contacts-home',
  standalone: true,
  imports: [],
  templateUrl: './contacts-home.html',
  styleUrl: './contacts-home.scss',
})
export class ContactsHomeComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly friendsApi = inject(FriendsApiService);
  private readonly dialogsApi = inject(DialogsApiService);
  private readonly blocksApi = inject(BlocksApiService);
  private readonly router = inject(Router);

  readonly user = this.authSession.user;
  readonly view = signal<'friends' | 'blocked'>('friends');
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly friends = signal<FriendDto[]>([]);
  readonly blockedUsers = signal<BlockDto[]>([]);
  readonly removingId = signal<string | null>(null);
  readonly openingChatId = signal<string | null>(null);
  readonly unblockingId = signal<string | null>(null);

  constructor() {
    this.loadFriends();
  }

  switchView(v: 'friends' | 'blocked'): void {
    this.view.set(v);
    this.errorMessage.set('');
    if (v === 'blocked' && this.blockedUsers().length === 0) {
      this.loadBlocked();
    }
  }

  removeFriend(userId: string): void {
    if (this.removingId()) return;
    this.removingId.set(userId);
    this.friendsApi.removeFriend(userId)
      .pipe(finalize(() => this.removingId.set(null)))
      .subscribe({
        next: () => this.friends.update(list => list.filter(f => f.userId !== userId)),
        error: () => this.errorMessage.set('Unable to remove friend right now.'),
      });
  }

  openChat(userId: string): void {
    if (this.openingChatId()) return;
    this.openingChatId.set(userId);
    this.dialogsApi.createDialog(userId)
      .pipe(finalize(() => this.openingChatId.set(null)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/app/messages'),
        error: () => this.errorMessage.set('Unable to open chat right now.'),
      });
  }

  unblockUser(userId: string): void {
    if (this.unblockingId()) return;
    this.unblockingId.set(userId);
    this.blocksApi.unblockUser(userId)
      .pipe(finalize(() => this.unblockingId.set(null)))
      .subscribe({
        next: () => this.blockedUsers.update(list => list.filter(b => b.blockedUserId !== userId)),
        error: () => this.errorMessage.set('Unable to unblock user right now.'),
      });
  }

  private loadFriends(): void {
    this.isLoading.set(true);
    this.friendsApi.getFriends()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: friends => this.friends.set(friends),
        error: () => this.errorMessage.set('Unable to load contacts.'),
      });
  }

  private loadBlocked(): void {
    this.isLoading.set(true);
    this.blocksApi.getBlocks()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: blocked => this.blockedUsers.set(blocked),
        error: () => this.errorMessage.set('Unable to load blocked users.'),
      });
  }
}
```

- [ ] **Step 7: Update `contacts-home.html`** — add tab toggle above the connections grid and a blocked list view

At the very top of the `<!-- Left: Directory & Connections -->` `<div>`, **after** the `<div class="flex items-end justify-between">` header block (line 8), insert a tab toggle:

```html
<!-- View toggle -->
<div class="flex gap-2">
  <button class="px-4 py-1.5 text-xs font-bold rounded-lg transition-colors"
          [class.bg-primary]="view() === 'friends'"
          [class.text-on-primary]="view() === 'friends'"
          [class.bg-surface-container-low]="view() !== 'friends'"
          [class.text-on-surface-variant]="view() !== 'friends'"
          (click)="switchView('friends')">Friends</button>
  <button class="px-4 py-1.5 text-xs font-bold rounded-lg transition-colors"
          [class.bg-primary]="view() === 'blocked'"
          [class.text-on-primary]="view() === 'blocked'"
          [class.bg-surface-container-low]="view() !== 'blocked'"
          [class.text-on-surface-variant]="view() !== 'blocked'"
          (click)="switchView('blocked')">Blocked</button>
</div>
```

**Replace** the entire friends `@if`/`@else if`/`@else` block (the one starting with `@if (isLoading())`) with:

```html
@if (isLoading()) {
  <div class="flex justify-center py-8">
    <span class="material-symbols-outlined text-2xl text-outline animate-spin">progress_activity</span>
  </div>
} @else if (errorMessage()) {
  <p class="text-error text-sm bg-error-container/20 border border-error/20 rounded-xl px-4 py-3">{{ errorMessage() }}</p>
} @else if (view() === 'friends') {
  @if (friends().length === 0) {
    <div class="text-center py-8 text-on-surface-variant text-sm">No connections yet. Send a friend request to connect.</div>
  } @else {
    <div class="grid grid-cols-2 gap-4">
      @for (friend of friends(); track friend.userId) {
        <div class="group relative bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 hover:shadow-sm transition-shadow">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-full bg-surface-container overflow-hidden shrink-0">
              @if (friend.avatarUrl) {
                <img [src]="friend.avatarUrl" class="w-full h-full object-cover" alt="" />
              } @else {
                <div class="w-full h-full flex items-center justify-center">
                  <span class="material-symbols-outlined text-on-surface-variant" style="font-size:1.25rem">person</span>
                </div>
              }
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-bold text-on-surface text-sm truncate">{{ friend.username }}</p>
            </div>
          </div>
          <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              class="flex-1 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:bg-primary-dim transition-colors disabled:opacity-50"
              [disabled]="openingChatId() === friend.userId"
              (click)="openChat(friend.userId)">Chat</button>
            <button
              class="flex-1 py-1.5 bg-error-container text-on-error-container text-xs font-bold rounded-lg hover:bg-error hover:text-on-error transition-colors disabled:opacity-50"
              [disabled]="removingId() === friend.userId"
              (click)="removeFriend(friend.userId)">Remove</button>
          </div>
        </div>
      }
    </div>
  }
} @else {
  @if (blockedUsers().length === 0) {
    <div class="text-center py-8 text-on-surface-variant text-sm">No blocked users.</div>
  } @else {
    <div class="grid grid-cols-2 gap-4">
      @for (blocked of blockedUsers(); track blocked.blockedUserId) {
        <div class="group relative bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 hover:shadow-sm transition-shadow">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-full bg-surface-container overflow-hidden shrink-0">
              @if (blocked.avatarUrl) {
                <img [src]="blocked.avatarUrl" class="w-full h-full object-cover" alt="" />
              } @else {
                <div class="w-full h-full flex items-center justify-center">
                  <span class="material-symbols-outlined text-on-surface-variant" style="font-size:1.25rem">person</span>
                </div>
              }
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-bold text-on-surface text-sm truncate">{{ blocked.blockedUsername }}</p>
            </div>
          </div>
          <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              class="flex-1 py-1.5 bg-surface-container text-on-surface text-xs font-bold rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-50"
              [disabled]="unblockingId() === blocked.blockedUserId"
              (click)="unblockUser(blocked.blockedUserId)">Unblock</button>
          </div>
        </div>
      }
    </div>
  }
}
```

- [ ] **Step 8: Run full Angular test suite**

```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
```

Expected: all tests PASS. Existing `ContactsHomeComponent` test (`should create`) may now need `BlocksApiService` provided — if it fails add `provideHttpClient()` and `provideHttpClientTesting()` to its `TestBed.configureTestingModule`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/core/blocks/ \
        frontend/src/app/features/contacts/contacts-home/
git commit -m "feat: BlocksApiService + blocked users view in ContactsHomeComponent"
```

---

## Task 7: Dynamic sidebar with real rooms + unread badges

**Context:** `WorkspaceShellComponent` (`frontend/src/app/features/workspace/workspace-shell.component.ts`) currently shows a hardcoded room list in the sidebar (`#engineering-room`, `#design-ops`, `#product-roadmap`). `UnreadService.unreadCounts` is a `Signal<Map<string, number>>` where keys are `"room:{roomId}"` and `"dialog:{dialogId}"`. `ChatService` already calls `unread.setCount(e.contextType, e.contextId, e.count)` when `UnreadCountChanged` hub event arrives. `RoomsApiService.getMyRooms()` returns `RoomDto[]` including rooms the user is a member of.

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.ts`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.html`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.spec.ts`

- [ ] **Step 1: Update `workspace-shell.component.spec.ts`**

The spec must provide `HttpClient` because `RoomsApiService` uses it. Replace with:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { WorkspaceShellComponent } from './workspace-shell.component';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { signal } from '@angular/core';

describe('WorkspaceShellComponent', () => {
  let component: WorkspaceShellComponent;
  let fixture: ComponentFixture<WorkspaceShellComponent>;
  let http: HttpTestingController;

  const mockUser = { id: 'uid1', username: 'alice', email: 'a@x.com', avatarUrl: null };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceShellComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthSessionService,
          useValue: {
            user: signal(mockUser),
            accessToken: signal('tok'),
            clearSession: () => {},
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceShellComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create and load my rooms on init', async () => {
    fixture.detectChanges();
    // presence + chat connect will try to build hub connections; ignore
    http.match(() => true).forEach(r => r.flush([]));
    await fixture.whenStable();
    expect(component).toBeTruthy();
  });

  it('getUnreadCount() returns 0 when no unread', () => {
    fixture.detectChanges();
    http.match(() => true).forEach(r => r.flush([]));
    expect(component.getUnreadCount('room', 'some-id')).toBe(0);
  });
});
```

- [ ] **Step 2: Run spec to verify current state**

```bash
cd frontend
npx ng test --include="src/app/features/workspace/workspace-shell.component.spec.ts" \
  --watch=false --browsers=ChromeHeadless
```

Note current pass/fail count to compare after the change.

- [ ] **Step 3: Update `workspace-shell.component.ts`**

```typescript
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { PresenceService } from '../../core/signalr/presence.service';
import { ChatService } from '../../core/signalr/chat.service';
import { UnreadService } from '../../core/signalr/unread.service';
import { RoomsApiService } from '../../core/rooms/rooms-api.service';
import type { RoomDto } from '../../core/rooms/rooms.models';

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Button],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.scss',
})
export class WorkspaceShellComponent implements OnInit, OnDestroy {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly presence = inject(PresenceService);
  private readonly chat = inject(ChatService);
  private readonly unread = inject(UnreadService);
  private readonly roomsApi = inject(RoomsApiService);

  readonly user = this.authSession.user;
  readonly logoutError = signal('');
  readonly myRooms = signal<RoomDto[]>([]);
  readonly unreadCounts = this.unread.unreadCounts;

  ngOnInit(): void {
    void this.presence.connect();
    void this.chat.connect();
    this.roomsApi.getMyRooms().subscribe({
      next: rooms => this.myRooms.set(rooms),
    });
  }

  ngOnDestroy(): void {
    void this.presence.disconnect();
    void this.chat.disconnect();
  }

  getUnreadCount(contextType: string, contextId: string): number {
    return this.unread.getCount(contextType, contextId);
  }

  logout(): void {
    this.logoutError.set('');
    this.authApi.logout().subscribe({
      next: async () => {
        await this.presence.disconnect();
        await this.chat.disconnect();
        this.unread.clearAll();
        this.authSession.clearSession();
        void this.router.navigateByUrl('/auth');
      },
      error: () => {
        this.logoutError.set('Unable to sign out right now. Try again in a moment.');
      },
    });
  }
}
```

- [ ] **Step 4: Update the sidebar section in `workspace-shell.component.html`**

Replace the static rooms `<div class="space-y-1">` block (the one with hardcoded `#engineering-room`, `#design-ops`, `#product-roadmap`) with a dynamic `@for` list. Specifically, replace these lines:

```html
      <div class="space-y-1">
          <div class="flex items-center justify-between p-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined">forum</span>
              <span class="text-on-surface font-bold">Rooms</span>
            </div>
            <span class="material-symbols-outlined text-sm">keyboard_arrow_down</span>
          </div>
          <div class="pl-9 space-y-1">
            <div class="p-2 bg-surface-container-lowest text-on-surface font-bold rounded-lg cursor-pointer text-sm">#engineering-room</div>
            <div class="p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm">#design-ops</div>
            <div class="p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm">#product-roadmap</div>
          </div>
        </div>
```

With:

```html
      <div class="space-y-1">
          <div class="flex items-center justify-between p-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined">forum</span>
              <span class="text-on-surface font-bold">Rooms</span>
            </div>
            <span class="material-symbols-outlined text-sm">keyboard_arrow_down</span>
          </div>
          <div class="pl-9 space-y-1">
            @for (room of myRooms(); track room.id) {
              <a [routerLink]="['/app/rooms', room.id]"
                 routerLinkActive="bg-surface-container-lowest text-on-surface font-bold"
                 class="flex items-center justify-between p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm rounded-lg">
                <span class="truncate">#{{ room.name }}</span>
                @let count = getUnreadCount('room', room.id);
                @if (count > 0) {
                  <span class="ml-1 shrink-0 min-w-[1.25rem] h-5 px-1 bg-primary text-on-primary text-[10px] font-black rounded-full flex items-center justify-center">{{ count }}</span>
                }
              </a>
            } @empty {
              <div class="p-2 text-on-surface-variant text-sm italic">No rooms yet</div>
            }
          </div>
        </div>
```

- [ ] **Step 5: Run full Angular test suite**

```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
```

Expected: all tests PASS.

- [ ] **Step 6: Build check**

```bash
cd frontend && npx ng build --configuration=development 2>&1 | tail -20
```

Expected: `Build at:` line with 0 errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/workspace/
git commit -m "feat: dynamic sidebar with real rooms + unread badges from UnreadService"
```

---

## Self-Review

### 1. Spec Coverage

| Requirement | Covered by Task |
|-------------|-----------------|
| GET/POST/DELETE /admin/bans + Redis sync | Task 1 |
| PlatformBansApiService Angular | Task 2 |
| Wire PlatformBansComponent (form + active/revoked bans) | Task 3 |
| RoomsAdminApiService (9 admin operations) | Task 4 |
| Wire ManageRoomComponent 5-tab modal (members/admins/banned/invitations/settings) | Task 5 |
| BlocksApiService | Task 6 |
| Blocked-users view in ContactsHomeComponent | Task 6 |
| Dynamic sidebar with real rooms | Task 7 |
| Unread badge per room in sidebar | Task 7 |

### 2. Type Consistency Check

- `PlatformBanDto` defined in Task 1 → used in Tasks 2 and 3 ✓
- `IssuePlatformBanRequest` defined in Task 1 → request body in Task 2 ✓
- `RoomBanDto`, `RoomInvitationDto`, `UpdateRoomRequest` defined in Task 4 → used in Task 5 ✓
- `BlockDto` defined in Task 6 → used in Task 6 template ✓
- `switchTab(tab: Tab)` in manage-room.ts → called in spec as `component.switchTab('banned')` ✓
- `switchView(v: 'friends' | 'blocked')` in contacts-home.ts → called in template ✓
- `getUnreadCount(contextType, contextId)` in workspace-shell.ts → called in template ✓

### 3. Placeholder Scan

No "TBD", "TODO", or "add appropriate error handling" phrases — all error handlers show specific error messages. All code blocks are complete.
