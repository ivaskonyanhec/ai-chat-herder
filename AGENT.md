# AGENT.md — AI Chat Herder System Instructions

**Audience:** AI coding agents (Codex, Claude, etc.) working on this repository.
**Authority:** These instructions override all default agent behaviors. Read this file in full before touching any code.

---

## 1. Identity

You are an **Expert Fullstack Engineer** specializing in **.NET 10 (C# 14)** and **Angular 21**.

You produce production-quality code that is secure, typed, and Docker-compatible. You do not take shortcuts on security, typing, or correctness. You do not implement features not specified in this document.

---

## 2. Transparency Protocol — MANDATORY

**Before modifying any file**, append an entry to `DEVELOPMENT_LOG.md`.

Format:
```
`[YYYY-MM-DD T{N}]` | **{Task title}** | {Reasoning} | {Files changed or to be changed}
```

- `T{N}` is the next sequential task number (check the log for the last entry before writing).
- Write the log entry *before* making the code change — not after.
- Be specific: name the files, tables, endpoints, or hub methods involved.

---

## 3. Coding Standards

### 3.1 Backend (.NET 10)

- **API style:** Minimal APIs only. No MVC controllers. Each endpoint file is a `static class` with a `Map(RouteGroupBuilder)` method.
- **Error handling:** Use the **Result pattern** (`Result<T, Error>`) for use-case return values. Map errors to HTTP responses in the endpoint handler, not inside use cases.
- **Password hashing:** **Argon2id** via `Konscious.Security.Cryptography`. Parameters: 64 MiB memory, 3 iterations, parallelism 1. Self-describing encoded string in `Users.PasswordHash`. No separate salt column.
- **Validation:** Validate at system boundaries (endpoint handlers, hub methods). No validation inside Domain or Application layers.
- **Async:** All I/O is `async/await`. No `.Result` or `.Wait()` calls.
- **Nullable:** Enable `<Nullable>enable</Nullable>` in every project. No `!` suppression without a comment.
- **Dependency rule:** `Domain` → no external deps. `Application` → `Domain` only. `Infrastructure` → implements `Application` ports. `API` → wires DI, calls `Application`.

### 3.2 Frontend (Angular 21)

- **State:** Angular Signals throughout. Use `signal<T>()`, `computed()`, and `effect()`. No RxJS BehaviorSubjects for component state.
- **Components:** Standalone components only. No NgModules.
- **Control flow:** `@if`, `@for`, `@switch` only. No `*ngIf` / `*ngFor` directives.
- **Typing:** `strict: true` in `tsconfig.json`. No `any`. No `as` type assertions without a `// justification` comment.
- **CSS/SCSS:** Consume `designs/tokens.css` CSS custom properties exclusively — no hardcoded hex values. Follow `DESIGN.md` for all visual rules (surface hierarchy, No-Line rule, roundness limits, typography scale). Pixel-accurate mockups are in `designs/*.html` — open in browser before implementing any screen.
- **HTTP:** `HttpClient` with `AuthInterceptor` that injects `Authorization: Bearer {token}` on all requests.

### 3.3 Docker First

Every piece of code must be compatible with the Docker Compose environment defined in §11 of `ARCHITECTURE.md`. Specifically:
- Never hardcode `localhost`. Read connection strings from `IConfiguration`.
- Never use `appsettings.Development.json` for secrets. Use environment variables.
- File paths use `IConfiguration["Storage:BasePath"]` — never hardcoded.
- EF Core migrations must run on startup (`app.MigrateAsync()` in `Program.cs`) or via an explicit migration script.

### 3.4 Security Rules

- **File access:** `GET /api/files/{attachmentId}` must validate that the requesting user is an active (non-banned) member of the room that contains the linked message, or a participant of the dialog. Check PostgreSQL — not Redis. Redis does not store membership.
- **Room membership:** `RoomMembership` table is authoritative for all access-control decisions. Redis tracks only currently-connected users for presence.
- **Sequence numbers:** Allocate via `UPDATE ContextSequences SET NextValue = NextValue + 1 … RETURNING NextValue` within the same transaction as the message INSERT. Never use `MAX() + 1`.
- **JWT on WebSocket:** Pass as `?access_token=` query string — this is the only browser-compatible mechanism for WebSocket upgrades.
- **Ban gate:** `BanCheckMiddleware` runs after `UseAuthentication()`, checks `ban:{userId}` in Redis → `403`. Do not reorder.

---

## 4. Tech Stack Reference

| Layer | Technology |
|-------|-----------|
| Backend API | .NET 10 — Minimal APIs |
| Real-time | ASP.NET Core SignalR |
| ORM | Entity Framework Core 10 + Npgsql |
| Database | PostgreSQL 17 |
| Cache / Presence | Redis 7 |
| Message Broker | RabbitMQ 3.13 (activity logging only) |
| Frontend | Angular 21 (Signals, Standalone, Control Flow) |
| Containerisation | Docker & Docker Compose |

---

## 5. Clean Architecture — Layer Boundaries

```
ai-chat-herder/
├── src/
│   ├── ChatHerder.Domain/           # Entities, enums, domain events, port interfaces
│   ├── ChatHerder.Application/      # Use cases, DTOs, IFileStorage, IMessageBus
│   ├── ChatHerder.Infrastructure/   # EF Core, Redis, RabbitMQ, LocalFileStorage
│   └── ChatHerder.API/              # Minimal API endpoints, SignalR Hubs, DI wiring
└── frontend/                        # Angular 21 standalone SPA
```

### Application Port Interfaces (defined in Application, implemented in Infrastructure)

```
IFileStorage        → LocalFileStorage (Docker volume)
IMessageBus         → RabbitMqMessageBus
IActivityLogger     → publishes ActivityEvent to RabbitMQ
IPresenceStore      → RedisPresenceStore
ISessionStore       → RedisSessionStore + EF Session persistence
IUnreadStore        → RedisUnreadStore + EF ReadMarker persistence
IEmailSender        → SmtpEmailSender (password reset)
```

### Middleware Pipeline Order (strict — do not reorder)

```
UseAuthentication()              ← JWT → HttpContext.User
BanCheckMiddleware               ← ban:{userId} Redis → 403
SessionValidationMiddleware      ← SISMEMBER sessions:valid:{userId} → 401
UseAuthorization()
Endpoints / Hubs
```

---

## 6. Domain Model

| Entity | Key Facts |
|--------|-----------|
| `User` | `Username` immutable. `DeletedAt` soft-delete (email+username reserved). |
| `Session` | One per browser login. `RefreshToken`, `UserAgent`, `IpAddress`, `KeepSignedIn`. |
| `PasswordResetToken` | Single-use, 1-hour TTL. `UsedAt` prevents reuse. |
| `Room` | `Visibility: Public\|Private`. Exactly one owner. `DeletedAt` soft-delete. |
| `RoomMembership` | Authoritative membership. `Role: Owner\|Admin\|Member`. |
| `RoomBan` | Remove = ban. No "remove without ban." `RevokedAt` for unban. |
| `RoomInvitation` | `Status: Pending\|Accepted\|Rejected`. Private rooms only. |
| `Message` | `SequenceNumber` per-room monotonic. `ReplyToMessageId` self-ref nullable FK. `DeletedAt` soft-delete. |
| `PersonalDialog` | Exactly 2 participants. `User1Id < User2Id` enforced in application. `FrozenAt` on block. |
| `PersonalDialogMessage` | Same features as `Message`. `SequenceNumber` per-dialog. |
| `Attachment` | `StoragePath` relative. `Comment` optional. `SizeBytes`. |
| `FriendRequest` | `Status: Pending\|Accepted\|Rejected`. Optional `Message`. |
| `Friendship` | Normalised pair `(User1Id < User2Id)`. Gates DM creation. |
| `UserBlock` | Unidirectional. Freezes dialog, terminates friendship. |
| `ReadMarker` | Per-user per-context. `ContextType: room\|dialog`. Durable unread source. |
| `ContextSequences` | `(ContextType, ContextId)` → `NextValue`. Row-locked `UPDATE … RETURNING`. |
| `ActivityLog` | Written async by `ActivityConsumer` from RabbitMQ. `EventType` + `Payload jsonb`. |
| `PlatformBan` | Admin-issued global ban. Paired with Redis `ban:{userId}`. |

---

## 7. Security Model

### JWT

- Access token: 15 min TTL. Claims: `user_id`, `session_id`, `jti`.
- Refresh token: opaque, stored on `Sessions` row. TTL: 7 days (`keepSignedIn=true`) / 24 hours.

### Three Ban Types — Never Conflate

| Type | Table | Issuer | Effect |
|------|-------|--------|--------|
| Platform ban | `PlatformBans` + Redis `ban:{userId}` | System admin | Global 403 on all requests |
| Room ban | `RoomBans` | Room admin/owner | Removed from room; cannot rejoin; file access revoked |
| User block | `UserBlocks` | Any user | DMs frozen; friendship terminated; presence hidden |

### Password Reset Flow

```
POST /api/auth/forgot-password → generate token → INSERT PasswordResetTokens → IEmailSender.SendResetEmailAsync
POST /api/auth/reset-password  → validate token → UPDATE PasswordHash → SET UsedAt → revoke all sessions
```

### Account Deletion Cascade

```
1. Delete owned rooms: IFileStorage.DeleteAsync() per file → DELETE Messages → DELETE Room
2. DELETE RoomMembership WHERE UserId (non-owned rooms)
3. DELETE FriendRequest, Friendship, UserBlock involving user
4. SET Users.DeletedAt = now  (reserves email + username)
5. Revoke all sessions → ForceDisconnect all SignalR connections
```

---

## 8. Database Schema (key tables)

Full Mermaid ERD in `ARCHITECTURE.md` §6. Critical invariants:

- `Messages(RoomId, SequenceNumber)` unique index — gap detection.
- `PersonalDialogMessages(DialogId, SequenceNumber)` unique index.
- `RoomMembership(RoomId, UserId)` unique index.
- `Friendships(User1Id, User2Id)` unique index — `User1Id < User2Id` always.
- `PersonalDialogs(User1Id, User2Id)` unique index — `User1Id < User2Id` always.
- `UserBlocks(BlockerId, BlockedUserId)` unique index + reverse index.
- `ContextSequences(ContextType, ContextId)` composite PK.

---

## 9. API Endpoints Reference

All routes prefixed `/api`. Auth required unless marked `(public)`.

### Auth
```
POST   /auth/register              (public)
POST   /auth/login                 (public)
POST   /auth/logout
POST   /auth/refresh               (public)
POST   /auth/forgot-password       (public)
POST   /auth/reset-password        (public)
POST   /auth/change-password
DELETE /auth/account
```

### Sessions
```
GET    /sessions
DELETE /sessions/{id}
DELETE /sessions/current
```

### Users
```
GET    /users/me
PATCH  /users/me                   { avatarUrl }
GET    /users/by-username/{name}
```

### Rooms
```
GET    /rooms                      public catalog (?search=&page=&limit=)
GET    /rooms/my                   caller's rooms (public + private)
POST   /rooms
GET    /rooms/{id}
PATCH  /rooms/{id}                 [owner]
DELETE /rooms/{id}                 [owner]
POST   /rooms/{id}/join
DELETE /rooms/{id}/leave
GET    /rooms/{id}/messages        (?before={messageId}&limit=50)
GET    /rooms/{id}/messages        (?afterSeq={seq}&limit=50  — gap recovery)
GET    /rooms/{id}/members
```

### Room Admin
```
GET    /rooms/{id}/bans                           [admin]
POST   /rooms/{id}/members/{userId}/ban           [admin]
DELETE /rooms/{id}/bans/{userId}                  [admin]
POST   /rooms/{id}/members/{userId}/make-admin    [owner]
DELETE /rooms/{id}/members/{userId}/admin         [admin]  (cannot target owner or self)
DELETE /rooms/{id}/messages/{messageId}           [admin]
```

### Room Invitations
```
GET    /rooms/{id}/invitations     [admin]
POST   /rooms/{id}/invitations     [admin]  { username }
GET    /invitations
POST   /invitations/{id}/accept
POST   /invitations/{id}/reject
```

### Messages
```
PATCH  /messages/{id}              { content }  [author only, max 3 KB]
DELETE /messages/{id}              [author or room admin]
```

### Friends
```
GET    /friends
GET    /friends/requests
POST   /friends/requests           { username, message? }
POST   /friends/requests/{id}/accept
POST   /friends/requests/{id}/reject
DELETE /friends/{userId}
```

### Blocks
```
GET    /blocks
POST   /blocks                     { userId }
DELETE /blocks/{userId}
```

### Personal Dialogs
```
GET    /dialogs
POST   /dialogs                    { userId }
GET    /dialogs/{id}
GET    /dialogs/{id}/messages      (?before={messageId}&limit=50)
GET    /dialogs/{id}/messages      (?afterSeq={seq}&limit=50  — gap recovery)
PATCH  /dm-messages/{id}           { content }  [sender only]
DELETE /dm-messages/{id}           [sender only]
```

### Files
```
POST   /files/upload               multipart/form-data (20 MB / 3 MB image limits)
GET    /files/{attachmentId}       access-controlled stream
```

### Notifications
```
GET    /unread
POST   /rooms/{id}/read
POST   /dialogs/{id}/read
```

---

## 10. SignalR Hubs

### PresenceHub `/hubs/presence`

**Client → Server:**

| Method | Parameters | Description |
|--------|-----------|-------------|
| `Heartbeat` | — | Liveness keepalive every 30s; clears AFK for this tab |
| `SetAfk` | — | Client reports 60s inactivity; server marks tab AFK |
| `SetActive` | — | Client reports interaction after AFK |
| `JoinRoom` | `roomId` | Add connection to `room:{roomId}` SignalR group |
| `LeaveRoom` | `roomId` | Remove connection from room group |

**Server → Client:**

| Method | Payload | Description |
|--------|---------|-------------|
| `UserStatusChanged` | `{ userId, status }` | `"online"\|"afk"\|"offline"` |
| `RoomMembersSnapshot` | `{ roomId, members[] }` | Full list on JoinRoom |
| `MemberJoined` | `{ roomId, user }` | Another user joined |
| `MemberLeft` | `{ roomId, userId }` | Another user left or was removed |
| `RemovedFromRoom` | `{ roomId, reason }` | Current user was banned |
| `FriendRequestReceived` | `{ requestId, fromUserId, fromUsername, message }` | |
| `FriendRequestAccepted` | `{ userId, username }` | |
| `RoomInvitationReceived` | `{ invitationId, roomId, roomName, fromUserId }` | |
| `DialogFrozen` | `{ dialogId }` | Block applied; DM now read-only |
| `ForceDisconnect` | `{ reason }` | Session revoked or platform ban |

### ChatHub `/hubs/chat`

**Client → Server (rooms):**

| Method | Parameters |
|--------|-----------|
| `SendMessage` | `roomId, content, replyToId?, attachmentId?` |
| `EditMessage` | `messageId, newContent` |
| `DeleteMessage` | `messageId` |
| `StartTyping` | `roomId` |
| `StopTyping` | `roomId` |

**Client → Server (DMs):**

| Method | Parameters |
|--------|-----------|
| `SendDirectMessage` | `dialogId, content, replyToId?, attachmentId?` |
| `EditDirectMessage` | `messageId, newContent` |
| `DeleteDirectMessage` | `messageId` |
| `StartTypingDM` | `dialogId` |
| `StopTypingDM` | `dialogId` |

**Server → Client:**

| Method | Payload |
|--------|---------|
| `MessageReceived` | `MessageDto` |
| `MessageEdited` | `MessageDto` |
| `MessageDeleted` | `{ messageId, roomId }` |
| `UserTyping` | `{ roomId, userId, isTyping }` |
| `DirectMessageReceived` | `DialogMessageDto` |
| `DirectMessageEdited` | `DialogMessageDto` |
| `DirectMessageDeleted` | `{ messageId, dialogId }` |
| `UserTypingInDialog` | `{ dialogId, userId, isTyping }` |
| `UnreadCountChanged` | `{ contextType, contextId, count }` |

### MessageDto Shape

```csharp
record MessageDto(
    Guid        Id,
    long        SequenceNumber,
    string      Content,
    UserSummary Sender,
    DateTime    SentAt,
    DateTime?   EditedAt,
    bool        IsDeleted,
    MessageDto? ReplyTo,        // embedded snapshot, not live FK
    AttachmentDto? Attachment
);
```

---

## 11. Presence Engine

### Redis Keys

```
active:users                    Set        userId[]
presence:tabs:{userId}          SortedSet  member=connId, score=Unix heartbeat timestamp
afk_tabs:{userId}               Set        connId[] of tabs that called SetAfk
presence:conn:{connId}          String     userId    TTL=70s
presence:status:{userId}        String     "online"|"afk"|"offline"    TTL=90s
presence:session:{connId}       String     sessionId    TTL=70s
sessions:valid:{userId}         Set        sessionId[]
ban:{userId}                    String     "1"    TTL=ban duration
unread:{userId}:room:{roomId}   String     integer count
unread:{userId}:dialog:{id}     String     integer count
```

**Critical:** `room:members:{roomId}` does NOT exist. Room membership is PostgreSQL-only.

### AFK Logic

- Client tracks DOM events (mousemove, keydown, click, scroll, touchstart) **throttled to 1 per second** (raw mousemove at 60fps × 300 users = 18,000 callbacks/s — must be throttled).
- `document.visibilitychange` → `visible` resets the inactivity timer and calls `SetActive()` if AFK (handles tab resume after browser hibernation).
- `setInterval` every 5s: if `(now − lastActivityAt) >= 60s` → call `SetAfk()`.
- On any throttled event while AFK: client calls `SetActive()`.
- Server: `SADD afk_tabs:{userId} {connId}`. If `SCARD afk_tabs == ZCARD presence:tabs` → broadcast `"afk"`.
- `PresenceMonitorService` (20s poll) is a ghost-cleanup safety net — designed specifically for tab hibernation (JS suspended, heartbeat stops, SetAfk never fires). Not the primary AFK detection path.
- SignalR client **must** use `.withAutomaticReconnect()`. `onreconnected` callback must re-invoke `JoinRoom` for all open rooms.
- **Transport invariant:** WebSocket for server-push events only; REST for all client-initiated queries and mutations. Never poll REST endpoints for real-time data.

---

## 12. Messaging Rules

- **Max size:** 3 KB (3,072 bytes UTF-8). Enforced in hub methods and REST edit endpoints.
- **Ordering:** Backend returns newest-first `(SentAt DESC, Id DESC)` for cursor efficiency. Angular reverses before rendering.
- **Pagination:** Keyset/cursor — `?before={messageId}&limit=50`. O(log N) via composite index.
- **Sequence allocation:** `UPDATE ContextSequences SET NextValue = NextValue + 1 … RETURNING NextValue` in the same transaction as the INSERT. `MAX() + 1` is forbidden.
- **Gap detection:** `seq == last+1` → accept. `seq > last+1` → call gap-recovery endpoint. `seq ≤ last` → discard.
- **Reply snapshot:** Embed `ReplyTo` DTO at send time. Survives original message deletion.
- **Soft delete:** `DeletedAt` set; `Content` omitted in DTO; UI renders `"Message deleted"`. Reply quotes preserve original content.

---

## 13. Attachments

- `image/*` → 3 MB limit. All other → 20 MB limit. Return `413` with description on violation.
- Upload via button (multipart/form-data) or clipboard paste (Angular `ClipboardEvent` handler on input).
- `Attachments.StoragePath` = relative path under `Storage:BasePath`.
- Access gate at `GET /api/files/{id}`: check RoomMembership (active, non-banned) or PersonalDialog participation via PostgreSQL. Frozen dialogs: allow download.
- `OrphanCleanupService` (nightly IHostedService): delete unlinked Attachments older than 24h.

---

## 14. Room Permission Matrix

| Action | Owner | Admin | Member |
|--------|:-----:|:-----:|:------:|
| Delete room | ✓ | — | — |
| Change room settings | ✓ | — | — |
| Promote member to admin | ✓ | — | — |
| Demote admin | ✓ (not self) | ✓ (not owner, not self) | — |
| Ban / remove member | ✓ | ✓ | — |
| Unban member | ✓ | ✓ | — |
| Delete any message | ✓ | ✓ | — |
| Delete own message | ✓ | ✓ | ✓ |
| View ban list | ✓ | ✓ | — |
| Invite to private room | ✓ | ✓ | — |
| Leave room | — | ✓ | ✓ |

**Remove = Ban.** There is no "remove without ban." `POST /rooms/{id}/members/{userId}/ban` always creates a `RoomBans` row.

---

## 15. UI Structure (Classic Web Chat)

### Navigation Bar
```
ChatLogo | Public Rooms | Private Rooms | Contacts | Sessions | Profile ▼ | Sign out
```

### Side Panel (left, collapsible to accordion inside a room)
```
Search [______________]
ROOMS
  > Public Rooms   (unread badge per room)
  > Private Rooms  (unread badge per room)
CONTACTS
  ● online   ◐ AFK   ○ offline   (unread badge per contact)
[Create room]
```

### Chat Window
- Messages displayed chronologically (oldest top, newest bottom).
- Auto-scroll to bottom only if user is within 100px of bottom.
- `IntersectionObserver` on topmost visible message triggers `?before=` pagination.
- Attachment rendered as file card with `FileName` + `Comment`.
- Reply shown as inline quote above message content.

### Members Panel (right sidebar inside a room)
- Room info (visibility, owner, admins).
- Member list with presence badges from `PresenceService.presenceMap`.
- Context menu on hover: "Send friend request" if not already friends.
- `[Invite user]` and `[Manage room]` buttons for admins.

### Admin Modal — 5 Tabs
| Tab | Source | Actions |
|-----|--------|---------|
| Members | `GET /rooms/{id}/members` | Make Admin, Ban (= remove) |
| Admins | `GET /rooms/{id}/members?role=admin` | Remove Admin (cannot target owner or self) |
| Banned users | `GET /rooms/{id}/bans` | Unban |
| Invitations | `GET /rooms/{id}/invitations` | Send invite by username |
| Settings | Room record | Edit name/description/visibility; Delete room |

### Angular Services (key Signals)
```typescript
// AuthService
currentUser = signal<User | null>(null);

// PresenceService
presenceMap = signal<Map<string, 'online' | 'afk' | 'offline'>>(new Map());

// UnreadService
unreadCounts = signal<Map<string, number>>(new Map());
```

---

## 16. Non-Functional Constraints

| Constraint | Value |
|-----------|-------|
| Simultaneous users | 300 |
| Max room participants | 1,000 |
| Message delivery latency | < 3s (actual: < 200ms WebSocket RTT) |
| Presence update latency | < 2s for all three transitions (online/offline/AFK) |
| History depth | 10,000+ messages via O(log N) keyset pagination |
| File limits | 20 MB general / 3 MB images |
| Message max size | 3 KB UTF-8 |
| Access token TTL | 15 minutes |
| Refresh token TTL | 7 days (keepSignedIn) / 24 hours |
| AFK threshold | 60 seconds client-side inactivity |

---

## 19. Design Reference — Slate Protocol

**Before implementing any UI component or screen, read the corresponding mockup and `DESIGN.md`.**

### Design System
- **Name:** Slate Protocol
- **Philosophy:** "Architectural Workspace / Structured Clarity"
- **Full rules:** `DESIGN.md` (colors, typography, roundness, elevation, component specs, Do's and Don'ts)
- **CSS tokens:** `designs/tokens.css` — import globally in `frontend/src/styles.scss`

### Pixel-Accurate Mockups (`designs/`)

| File | Screen | Key elements |
|------|--------|-------------|
| `authentication.html` | Sign In / Register / Forgot Password | Login form, Register form, password-reset link |
| `main-chat-interface.html` | Main Chat (room view) | Top nav, left sidebar (accordion), center message area, right members panel |
| `private-messaging.html` | DM / Personal Dialog | 2-person chat, frozen-dialog banner on block |
| `contacts-management.html` | Contacts / Friends list | Friend list with presence dots, pending requests |
| `public-room-catalog.html` | Public Room Catalog | Search bar, room cards with member count |
| `manage-room-settings.html` | Admin Modal | 5-tab modal: Members / Admins / Banned / Invitations / Settings |
| `profile-settings.html` | User Profile & Settings | Avatar, username display, account actions |
| `security-sessions.html` | Active Sessions | Session list with browser/IP/location, revoke button |
| `friend-requests.html` | Friend Requests | Incoming requests (Accept/Decline) + sent requests (Pending/Declined status) |
| `room-invitations.html` | Room Invitations | Pending private room invite cards with Accept/Decline per card |
| `platform-ban-admin.html` | Platform Ban Admin | Issue ban form, active bans table, revoked bans collapsed section |

### Critical Visual Rules (from DESIGN.md)
- **No 1px solid borders** for sectioning — use tonal background shifts only
- **No hardcoded hex values** — always use `var(--color-*)` tokens
- **`border-radius` max:** `var(--radius-lg)` (0.5rem) for structural elements
- **Sidebar background:** `var(--nav-gradient)` for nav drawer; `var(--color-surface-container)` for panels
- **Message area background:** `var(--color-surface-container-lowest)` (#ffffff)
- **Input background:** `var(--color-surface-container-low)` (#f0f4f7)
- **Status dots:** 8px, "porthole" cutout border, colors: online=#4caf50, afk=#ffb300, offline=#717c82

### Sync Rule
Whenever the Stitch design is updated, re-export and update both `designs/tokens.css` and `DESIGN.md`. Log the change in `DEVELOPMENT_LOG.md`.

---

## 17. Jabber / XMPP — Optional, Implement Last

**Do not implement unless all core requirements are complete and the user explicitly requests it.**

Design sketch if requested:
- Library: `XmppDotNet` (MIT).
- Ports: 5222 (c2s), 5269 (s2s).
- New project: `ChatHerder.Xmpp/`.
- Admin dashboard: `GET /admin/jabber` (Angular route), `JabberAdminHub` SignalR hub for live stats.
- Docker Compose: two XMPP service entries for federation testing.

---

## 18. Key Decisions (Do Not Relitigate)

| Decision | Reason |
|----------|--------|
| `RoomMembership` table, not Redis | Redis is volatile; restart erases all memberships silently |
| Three separate ban types | Different issuers, scopes, and effects; merging them creates access-control bugs |
| `PersonalDialog` separate from `Rooms` | Fixed participants, no admin, friend gate, frozen-on-block — these invariants are unenforceable on a shared table |
| `ContextSequences` counter table | `MAX()+1` has a TOCTOU race; counter table row-lock serializes concurrent writers |
| Client-driven AFK (`SetAfk`/`SetActive`) | Browser is the only component with direct access to DOM input events; server polling inverts the architecture |
| Keyset pagination | Offset is O(N) at depth; keyset is O(log N) at any history depth |
| Offline delivery via DB + ReadMarkers | No per-user queues; unread counters are bounded integers, not message payloads |
| Reply snapshot embedded in DTO | Quoted text survives original message deletion |
| Soft delete for messages | Preserves reply chain coherence; placeholder maintains threading |
| Minimal APIs (no controllers) | Idiomatic .NET 10; endpoint groups are independently testable via `WebApplicationFactory` |
