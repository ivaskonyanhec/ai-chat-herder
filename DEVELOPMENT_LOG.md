# Development Log — AI Chat Herder

Format: `[Timestamp] | Task | Reasoning | Changes`

---

## 2026-04-18 — Architecture Planning Session

---

`[2026-04-18 T1]` | **Define tech stack** | Project is greenfield; establish fixed technology choices before designing anything else | Stack locked: .NET 10 Minimal APIs, SignalR, EF Core + PostgreSQL, Angular 21 (Signals + Standalone + Control Flow), Redis, Docker Compose

---

`[2026-04-18 T2]` | **Choose authentication mechanism** | JWT vs cookie sessions vs external OAuth — choice determines SignalR handshake, token refresh strategy, and session granularity | Decision: **JWT (stateless)** — access token (15 min) + opaque refresh token (7-day TTL); JWT passed as `?access_token=` query string on WebSocket upgrades (browser limitation)

---

`[2026-04-18 T3]` | **Define room model scope** | Public rooms only vs private rooms vs DMs affects the entire authorization layer complexity | Decision: **public rooms only for MVP**; Friendships and Bans tables schema-stubbed for future expansion without complicating initial auth model

---

`[2026-04-18 T4]` | **Determine deployment scale** | Single instance vs multiple replicas determines whether Redis needs to act as a SignalR backplane (cross-instance message fan-out) | Decision: **multiple horizontal replicas** — Redis serves dual role: SignalR backplane (cross-replica broadcast) + presence state store

---

`[2026-04-18 T5]` | **Choose file storage strategy** | Local disk is incompatible with horizontal scaling; need a path to object storage without a rewrite | Decision: **IFileStorage abstraction** — `LocalFileStorage` (MVP, Docker named volume shared across replicas) → `S3FileStorage` (future) swapped at DI registration, zero Application/Domain layer changes

---

`[2026-04-18 T6]` | **Add internal message queue** | Async activity logging and future extensibility require decoupled event processing | Decision: **RabbitMQ** (topic exchange `chat.events`) running in Docker Compose; `ActivityConsumer` IHostedService subscribes to `chat.events.#` and writes to `ActivityLogs` table — zero impact on hot path latency

---

`[2026-04-18 T7]` | **Define online tracking / activity logging** | "Online tracking" clarified as audit logging of user actions, not UI presence tracking | Decision: `ActivityLogs` table with `EventType` (string) + `Payload` (jsonb); events published to RabbitMQ by the API, consumed asynchronously. Routing keys: `message.sent`, `user.connected`, `user.disconnected`, `user.joined_room`, `user.left_room`, `user.banned`, `session.revoked`

---

`[2026-04-18 T8]` | **Add session management feature** | User must view active sessions (browser/IP), revoke individual sessions, and logout from current browser without affecting other sessions | Changes: `Sessions` table added (RefreshToken, UserAgent, IpAddress, ExpiresAt, RevokedAt); `sessions:valid:{userId}` Redis Set for instant revocation; `GET/DELETE /api/sessions` endpoints; Angular `SessionsComponent`; on revoke → SREM from Redis + `ForceDisconnect` to associated SignalR connections

---

`[2026-04-18 T9]` | **Adopt .NET 10 Minimal API pattern** | No controllers — idiomatic .NET 10 approach eliminates MVC reflection overhead; endpoint groups independently testable | Changes: `API/Endpoints/` folder with static `*Endpoints.cs` classes each exposing a `Map(RouteGroupBuilder)` method; `Program.cs` composes via `app.MapGroup("/api").MapAuth().MapRooms().MapSessions().MapFiles()`

---

`[2026-04-18 T10]` | **Solve immediate ban enforcement with JWT** | JWT access tokens are valid for 15 minutes — a banned user can still act for up to 15 min after ban issuance; unacceptable for moderation | Decision: **Redis ban gate** — `SET ban:{userId} 1 EX {durationSeconds}`; `BanCheckMiddleware` runs in pipeline after `UseAuthentication()`, checks key before any business logic; on ban: (1) write DB row, (2) SET Redis key, (3) DEL all session entries, (4) ForceDisconnect all SignalR connections via `presence:tabs:{userId}` Sorted Set; temporary bans self-heal via Redis TTL

---

`[2026-04-18 T11]` | **Design Presence Engine** | Multi-tab support requires per-connection tracking; AFK detection must be efficient at scale | Decision: Redis Sorted Set `presence:tabs:{userId}` with score = Unix heartbeat timestamp; `ZRANGEBYSCORE` for O(stale) AFK detection; `PresenceMonitorService` polls every 20s; client heartbeats every 30s (2× margin before 60s AFK threshold); `active:users` Redis Set enables enumeration without SCAN

---

`[2026-04-18 T12]` | **Define SignalR hub topology** | Monolithic hub vs split hubs — mixing presence and chat in one hub creates unbounded coupling | Decision: **split hubs** — `PresenceHub` (`/hubs/presence`): Heartbeat, JoinRoom, LeaveRoom, UserStatusChanged, RoomMembersSnapshot, ForceDisconnect; `ChatHub` (`/hubs/chat`): SendMessage, EditMessage, DeleteMessage, StartTyping, StopTyping, MessageReceived, MessageEdited, MessageDeleted, UserTyping; typing indicators bypass RabbitMQ (ephemeral, Redis backplane delivers cross-replica for free)

---

`[2026-04-18 T13]` | **Fix spec self-review: middleware pipeline order** | `BanCheckMiddleware` and `SessionValidationMiddleware` both read JWT claims — they cannot run before `UseAuthentication()` populates `HttpContext.User` | Fix: pipeline order corrected to `UseAuthentication()` → `BanCheckMiddleware` → `SessionValidationMiddleware` → `UseAuthorization()` → Endpoints

---

`[2026-04-18 T14]` | **Fix spec self-review: active users enumeration** | `PresenceMonitorService` pseudocode iterated "active presence:status keys" without defining how — SCAN over all keys is O(N) and blocks Redis | Fix: added `active:users` Redis Set; `OnConnectedAsync` does `SADD active:users {userId}`; `OnDisconnectedAsync` does `SREM` when tab count reaches zero; monitor calls `SMEMBERS active:users` once per cycle — O(connected users), not O(all keys)

---

`[2026-04-18 T15]` | **Write ARCHITECTURE.md spec** | Consolidate all design decisions into a durable reference document | Output: `docs/superpowers/specs/2026-04-18-chat-server-architecture-design.md` covering: Clean Architecture layers, Minimal API structure, JWT + session + ban security model, Redis Presence Engine, PostgreSQL schema (Mermaid ERD + indexes), SignalR hub contracts, RabbitMQ topology, IFileStorage abstraction, Angular 21 structure, Docker Compose configuration, Decision Log appendix

---

## 2026-04-18 — Architecture Gap Analysis & Requirement-Complete Rewrite

---

`[2026-04-18 T16]` | **Gap analysis: validate ARCHITECTURE.md against requirements.md** | First architecture session was greenfield brainstorming without a requirements document; a formal requirements document was subsequently provided, revealing 29 of 38 requirement areas were missing or conflicting | Identified gaps: private rooms, DMs (PersonalDialog), friend system, user blocks, room admin roles, room bans (separate from platform bans), room invitations, unread notifications, message replies, attachment comment field, image size limit, cursor pagination, account deletion, password reset flow, friend presence subscriptions, Jabber/XMPP

---

`[2026-04-18 T17]` | **Introduce `RoomMembership` table** | Redis `room:members:{roomId}` was being used as the source of truth for room membership — volatile, lost on restart, and unsafe for access control decisions | Fix: `RoomMembership` PostgreSQL table (`RoomId`, `UserId`, `Role`) is now authoritative. Redis `room:members` key removed entirely. Redis tracks only currently-connected users for presence, never membership.

---

`[2026-04-18 T18]` | **Separate three ban types** | Original `Bans` table + Redis `ban:{userId}` gate conflated platform bans, room bans, and user-to-user blocks into one model — fundamentally incorrect, would cause catastrophic access control bugs | Fix: three distinct models: `PlatformBans` + Redis key (global API 403, admin-only), `RoomBans` table (per-room, admin-issued, remove = ban), `UserBlocks` table (user-to-user, freezes DMs and terminates friendship)

---

`[2026-04-18 T19]` | **Add PersonalDialog + PersonalDialogMessage model** | Requirements §2.5.1: DMs are functionally equivalent to rooms but have fixed 2-person participant lists, no admin, friend-only gate, and frozen-on-block semantics — cannot share the Messages table without making these invariants unenforceable | New tables: `PersonalDialogs` (User1Id, User2Id, FrozenAt), `PersonalDialogMessages` (with same feature set as Messages: replies, edit, soft delete). Normalised: User1Id < User2Id enforced in application to prevent duplicate dialog pairs.

---

`[2026-04-18 T20]` | **Add FriendRequest + Friendship state machine** | Requirements §2.3: friend system requires request/confirmation workflow; original `Friendships` table was a stub with no state machine | New tables: `FriendRequests` (SenderId, ReceiverId, Message, Status: Pending/Accepted/Rejected), `Friendships` (active relationship, normalised pair). Friendship gates DM creation and friend-list presence visibility.

---

`[2026-04-18 T21]` | **Add UserBlock model** | Requirements §2.3.5: user-to-user ban is distinct from room bans and platform bans; blocks DMs, terminates friendship, freezes existing dialog history | New table: `UserBlocks` (BlockerId, BlockedUserId). On block: freeze PersonalDialog (set FrozenAt), delete Friendship, broadcast `DialogFrozen` SignalR event to both parties. Frozen dialogs remain visible (read-only) per spec.

---

`[2026-04-18 T22]` | **Add RoomInvitation model** | Requirements §2.4.4/§2.4.9: private rooms require invitation-based join; without persistence, invitations are lost on restart | New table: `RoomInvitations` (RoomId, InvitedByUserId, InvitedUserId, Status: Pending/Accepted/Rejected). New SignalR event `RoomInvitationReceived` (distinct from `FriendRequestReceived`). New endpoints: `GET/POST /rooms/{id}/invitations`, `POST /invitations/{id}/accept`, `POST /invitations/{id}/reject`.

---

`[2026-04-18 T23]` | **Add ReadMarker + unread counter system** | Requirements §2.7.1: unread indicators per room and per dialog, cleared on open; not present in original architecture at all | Two-tier: Redis `unread:{userId}:{type}:{id}` strings for fast INCR/badge reads; PostgreSQL `ReadMarkers` table (UserId, ContextType, ContextId, LastReadMessageId, LastReadAt) for durability across restarts. On reconnect, unread counts re-hydrated from DB. Cleared by `POST /api/rooms/{id}/read` or `POST /api/dialogs/{id}/read`.

---

`[2026-04-18 T24]` | **Add Message.ReplyToMessageId (self-referential FK)** | Requirements §2.5.3: message reply feature; original Messages schema had no such column | Added `ReplyToMessageId` nullable FK to both `Messages` and `PersonalDialogMessages`. Server embeds a `ReplyTo` snapshot in the DTO at send time — not a live FK chain — so quoted text survives original message deletion.

---

`[2026-04-18 T25]` | **Add Attachments.Comment column + image size limit** | Requirements §2.6.3: optional comment per attachment; §3.4: image max 3 MB (separate from 20 MB general limit); both missing from original schema | Added `Comment` nullable string column to `Attachments`. Upload endpoint checks `Content-Type`: `image/*` → 3 MB limit, otherwise → 20 MB limit. Returns `413` with descriptive message specifying which limit applies.

---

`[2026-04-18 T26]` | **Design cursor-based (keyset) pagination** | Requirements §2.5.6/§3.3: infinite scroll through very old history (10,000+ messages); offset pagination degrades to O(N) at large offsets | Keyset pagination: `GET /rooms/{id}/messages?before={messageId}&limit=50`. Composite index `(RoomId, SentAt DESC, Id DESC) WHERE DeletedAt IS NULL` gives O(log N) scan regardless of history depth. Same pattern for dialog messages.

---

`[2026-04-18 T27]` | **Add account deletion cascade** | Requirements §2.1.5: delete account must remove owned rooms (with all their messages + files), remove memberships in other rooms, and soft-delete user record | Flow: delete owned rooms (cascade messages + files via IFileStorage), DELETE RoomMembership for non-owned rooms, DELETE FriendRequest/Friendship/UserBlock, SET Users.DeletedAt (email + username reserved to prevent reuse), revoke all sessions + ForceDisconnect.

---

`[2026-04-18 T28]` | **Add password reset flow + PasswordResetTokens table** | Requirements §2.1.4: password reset required; original architecture listed the endpoint but defined no flow, token mechanism, or email delivery | New table: `PasswordResetTokens` (Token, UserId, ExpiresAt 1h, UsedAt). New interface: `IEmailSender → SmtpEmailSender`. Flow: generate token → email → validate on reset → update hash → mark token used → revoke all sessions.

---

`[2026-04-18 T29]` | **Add friend presence subscription via `user-presence:{userId}` SignalR groups** | Requirements §2.7.2: presence updates < 2s; contacts list needs live presence indicators; no mechanism for friends to receive each other's status changes was defined | On `PresenceHub.OnConnectedAsync`: for each friend F, `Groups.AddToGroupAsync(connId, "user-presence:{F.UserId}")`. Status change broadcasts to `user-presence:{userId}` reach all online friends across replicas via Redis backplane. O(friends_count) group joins on connect — ~50 per user at target scale.

---

`[2026-04-18 T30]` | **Extend SignalR hubs for DMs** | Requirements §2.5.1: personal messages have the same feature set as room messages; ChatHub only covered room messages | Added to ChatHub: `SendDirectMessage`, `EditDirectMessage`, `DeleteDirectMessage`, `StartTypingDM`, `StopTypingDM` (client→server); `DirectMessageReceived`, `DirectMessageEdited`, `DirectMessageDeleted`, `UserTypingInDialog` (server→client). DM delivery uses recipient's connectionIds from Redis presence (no SignalR group — dialogs have exactly 2 fixed participants).

---

`[2026-04-18 T31]` | **Add room admin role permission matrix + owner/admin lifecycle** | Requirements §2.4.7/§2.4.8: owner and admin have distinct permissions; owner cannot leave room; remove = ban | Defined full permission matrix (owner/admin/member × action). `RoomMembership.Role` enum: Owner/Admin/Member. All admin actions validated server-side against role. Owner-only: delete room, change settings, promote/demote admins. Admin: ban/unban, delete any message, invite.

---

`[2026-04-18 T32]` | **Mark Jabber/XMPP as optional / implement last** | Requirements §6: Jabber is an advanced feature contingent on completing all other requirements first; user confirmed this explicitly | Section 17 in ARCHITECTURE.md documents the design sketch (XmppDotNet library, c2s port 5222, s2s port 5269, federation via Docker Compose, admin dashboard) but is explicitly gated: "implement last, only on explicit request".

---

`[2026-04-18 T33]` | **Fix spec self-review: room invitation event naming** | Room invitations used the same "FriendRequestReceived" language as friend requests — ambiguous and would cause client-side handler conflicts | Fix: dedicated `RoomInvitationReceived` SignalR event `{ invitationId, roomId, roomName, fromUserId }` added to PresenceHub server→client table; room system section updated accordingly.

---

`[2026-04-18 T34]` | **Full ARCHITECTURE.md rewrite** | Original spec covered only ~25% of requirements; gap analysis confirmed 29 of 38 areas missing or conflicting; requirement-complete rewrite needed | Replaced ARCHITECTURE.md with 18-section document covering: overview, tech stack, clean architecture, security (auth/sessions/3 ban types), domain model (16 entities), Mermaid ERD + indexes, complete API endpoint list, extended SignalR hub contracts, messaging model (3 KB limit/replies/soft delete/cursor pagination), attachments (image limit/paste/comment/access control), notifications (unread counters/read markers), presence engine (updated Redis structures), room system (membership lifecycle/invitations/permission matrix/cascade deletion), moderation (3 ban type separation), UI mapping (nav/side panel/chat window/admin modal), non-functional (capacity/latency/consistency), Jabber sketch (optional), decision log.

---

## 2026-04-18 — Surgical Correction Pass (11 Targeted Fixes)

---

`[2026-04-18 T35]` | **Fix admin permission mismatch: admin demotion** | Requirements §2.4.7 states admins may remove admin status from other admins (except owner); ARCHITECTURE.md incorrectly restricted this to owner-only | Fix: permission matrix updated — Demote Admin row now shows `✓` for Admin column (not owner, not self). API `DELETE /rooms/{id}/members/{userId}/admin` authorization changed from `[owner]` to `[admin]`. Server-side guard: reject if target is Owner or self.

---

`[2026-04-18 T36]` | **Unify Remove vs Ban** | Requirements §2.4.8 states removing a member IS banning them — no separate "remove without ban" action exists; UI Mapping admin modal and moderation section described them as separate actions | Fix: Members tab action list changed from "Make Admin, Ban, Remove from room" to "Make Admin, Ban (= remove from room)". Moderation section reworded to explicitly state: "Removing a member and banning a member are the same operation." API was already correct (single `/ban` endpoint).

---

`[2026-04-18 T37]` | **Add private rooms read path** | Private rooms are excluded from `GET /rooms` (public catalog) by design, but no endpoint existed for users to retrieve their own private room memberships, making the Private Rooms nav item unimplementable | Fix: Added `GET /rooms/my` — returns all rooms the caller is a member of (public + private), sorted by last message time. Nav table updated: Private Rooms tab now sources from `GET /api/rooms/my` filtered client-side to `Visibility = 'Private'`.

---

`[2026-04-18 T38]` | **Add explicit offline delivery guarantee** | Requirements §2.5.6 and §5 require messages sent to offline users to be delivered when they reconnect; architecture was silent on the delivery mechanism, leaving open the incorrect assumption that a message queue might be needed | Fix: New "Offline Delivery Guarantee" subsection added to Section 11. Explicit statement: "Offline delivery is implemented via durable storage and read progress, not per-user message queues." No unbounded queues anywhere in the system; unread counters are bounded integers, not message payloads.

---

`[2026-04-18 T39]` | **Clarify message ordering contract** | Requirements §2.5.6 requires chronological display; backend query returns newest-first for cursor efficiency, which could be misread as the display order | Fix: Added explicit "Message ordering contract" note in Section 9: backend returns descending `(SentAt, Id)` order; Angular reverses before rendering. Invariant stated: UI always displays strictly ascending chronological order.

---

`[2026-04-18 T40]` | **Clarify account deletion semantics** | Requirements §2.1.5 states "their account is removed"; architecture used soft delete (`DeletedAt`) which could be misread as the account still existing | Fix: Comment block added to deletion flow step 4 explaining that soft-delete is an internal implementation detail — functionally equivalent to permanent removal. Email + username are excluded from all queries; soft-delete solely reserves the identity strings to prevent reuse by new registrants.

---

`[2026-04-18 T41]` | **Specify password hashing algorithm** | Requirements §2.1.4 states passwords must be stored securely in hashed form; architecture was silent on the algorithm, leaving an underspecified security-critical decision | Decision: **Argon2id** (OWASP-recommended, RFC 9106) via `Konscious.Security.Cryptography`. Parameters: 64 MiB memory, 3 iterations, parallelism 1 (~100 ms per hash). Per-password 128-bit random salt encoded with hash in a single self-describing string in `Users.PasswordHash`.

---

`[2026-04-18 T42]` | **Add friend request from room member list** | Requirements §2.3.2 explicitly states friend requests can be sent from the room user list; no UI interaction flow was described for this path | Fix: Members Panel description in Section 15 extended with a context-menu interaction: hover/right-click on any member row shows "Send friend request" if not already friends and no block exists. Calls `POST /api/friends/requests { username, message? }`. No new endpoint required.

---

`[2026-04-18 T43]` | **Scope AFK latency SLA and justify detection delay** | Requirements §3.1 states presence updates should propagate within 2 seconds; AFK detection lags up to 80s (60s threshold + 20s monitor interval), creating an apparent requirement violation | Fix: AFK latency note added in Section 12 and Section 16 clarifying the SLA scope: the `< 2s` requirement applies to online/offline transitions (hub lifecycle events, synchronous). AFK is inherently coarse-grained — §2.2.2 defines it as "more than 1 minute inactive", making sub-second AFK detection neither required nor meaningful. Documented explicitly.

---

`[2026-04-18 T44]` | **Prohibit unbounded offline message queues** | Implicit architecture risk: if a user disappears for months, any per-user message queue would grow without bound; the spec did not explicitly prohibit this pattern | Fix: Explicit design rule stated in Section 11: no per-user message queues anywhere in the system. Offline delivery relies on PostgreSQL persistence + ReadMarkers + unread counters. Redis keys hold bounded integer counters, not payloads. Reconnecting user fetches history via normal pagination API.

---

`[2026-04-18 T45]` | **Introduce per-chat message sequence numbers** | Without monotonic sequence numbers, the client has no reliable mechanism to detect dropped or out-of-order messages during WebSocket reconnections or replica failover — silent message gaps are a correctness risk | Design: `SequenceNumber bigint` column added to `Messages` and `PersonalDialogMessages`. Unique indexes `(RoomId, SequenceNumber)` and `(DialogId, SequenceNumber)`. Generated server-side via `SELECT MAX + 1` inside INSERT transaction (Redis `INCR` available as higher-throughput alternative). `MessageDto` extended with `sequenceNumber`. Client gap detection: `seq == last+1` → accept; `seq > last+1` → re-fetch via recovery endpoint; `seq <= last` → discard duplicate. Recovery endpoints added: `GET /rooms/{id}/messages?afterSeq=X` and `GET /dialogs/{id}/messages?afterSeq=X`. SequenceNumbers are orthogonal to ReadMarkers — integrity vs. unread tracking.

---

## 2026-04-18 — Three Targeted Precision Fixes

---

`[2026-04-18 T46]` | **Fix admin modal UI wording for admin demotion** | After fixing the permission matrix (T35) to allow admins to demote other admins, the Admin Modal "Admins" tab description still read "Remove Admin (any admin; cannot demote owner)" — inconsistent with the API comment `[admin] demote admin (cannot target owner or self)` and the matrix cell `✓ (not owner, not self)` | Fix: Tab description changed to exactly "Remove Admin (cannot target owner or self)" — three-way match between matrix, API, and UI.

---

`[2026-04-18 T47]` | **Replace poll-based AFK detection with client-driven signaling** | Poll-based detection (PresenceMonitorService every 20s) produced up to 80s AFK lag, technically challenging the §3.1 < 2s presence SLA even with the earlier justification; a latency-proof design requires the AFK signal to originate at the browser | Design: Added `SetAfk()` and `SetActive()` to PresenceHub client→server methods. Angular `PresenceService` monitors DOM events (mousemove, keydown, click, scroll) and calls `SetAfk()` within 1s of crossing the 60s inactivity threshold; calls `SetActive()` on any subsequent event. Server uses `afk_tabs:{userId}` Redis Set to track per-connection AFK state; broadcasts `UserStatusChanged` when all tabs enter/exit AFK. AFK transition latency now ≤ 1.1s — inside the < 2s SLA. `PresenceMonitorService` demoted to safety-net role only: cleans up ghost connections (browser crash, network partition) that never called `SetAfk()` or triggered `OnDisconnectedAsync`. Also updated `OnDisconnectedAsync` to clean `afk_tabs` and correctly re-evaluate AFK state for remaining tabs. Section 16 Presence latency updated to confirm all three transitions (online/offline/AFK) satisfy the < 2s SLA.

---

`[2026-04-18 T48]` | **Replace MAX()+1 sequence generation with ContextSequences counter table** | `SELECT MAX(SequenceNumber) + 1 FROM Messages WHERE RoomId = X` has a race condition: two concurrent transactions can both read the same MAX and both attempt to insert the same sequence number, violating the unique index. The earlier spec presented this as safe with a "row-level lock" but no explicit lock target was identified — the lock must be on a dedicated counter row, not on the Messages table scan | Fix: New `ContextSequences` table `(ContextType varchar PK, ContextId uuid PK, NextValue bigint)`. Row created when room/dialog is created; deleted when room/dialog is deleted. Sequence allocation: `UPDATE ContextSequences SET NextValue = NextValue + 1 WHERE ContextType = 'room' AND ContextId = @roomId RETURNING NextValue` — executes in the same transaction as the message INSERT. PostgreSQL row-level lock on the ContextSequences row serializes concurrent writers for the same context. No MAX() scan, no race window, no Redis dependency for sequence correctness.

---

## 2026-04-18 — Agent Instruction Files

---

`[2026-04-18 T49]` | **Create AGENT.md and CLAUDE.md** | A machine-readable system instruction file is required for AI agents (Codex, Claude, etc.) to operate consistently in this hackathon project without re-deriving architecture decisions from scratch each session. `CLAUDE.md` provides Claude Code–specific extensions and keeps in sync with `AGENT.md` as the single source of truth | Created: `AGENT.md` (18 sections: identity, transparency protocol, coding standards, tech stack, clean architecture, domain model, security model, DB schema invariants, full API endpoint reference, SignalR hub contracts, presence engine Redis keys, messaging rules, attachments, room permission matrix, UI structure, non-functional constraints, Jabber gate, key decisions); Created: `CLAUDE.md` (extends AGENT.md with Claude Code skill invocation rules, memory file policy, tool preferences, and sync rule)
