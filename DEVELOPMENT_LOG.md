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
