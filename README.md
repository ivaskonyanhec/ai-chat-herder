# AI Chat Herder

[![CI](https://github.com/ivaskonyanhec/ai-chat-herder/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ivaskonyanhec/ai-chat-herder/actions/workflows/ci.yml)
![.NET 10](https://img.shields.io/badge/.NET-10-512BD4)
![Angular 21](https://img.shields.io/badge/Angular-21-DD0031)
![E2E/UAT Playwright](https://img.shields.io/badge/E2E%2FUAT-Playwright-2EAD33)

AI Chat Herder is a production-grade real-time chat application built on **.NET 10 Minimal APIs** and **Angular 21 Signals**. It supports public/private rooms, direct messages, friends, file sharing, moderation, persistent history, unread notifications, and multi-tab presence.

Target scale: 300 simultaneous users, up to 1,000 participants per room.

---

## Status

**Feature-complete.** All Phases 1–4 are implemented, reviewed, and passing CI.

| Suite | Files | Tests | Status |
|---|---|---|---|
| .NET unit | — | 100 | Passing |
| .NET integration | — | 2 | Passing |
| Angular unit | 28 | 114 | Passing |
| E2E / UAT | 11 spec files | — | Dockerized |

Phase 5 (XMPP/Jabber gateway) is architecturally planned but gated behind an explicit implementation request.

Useful status documents:

- `DEVELOPMENT_LOG.md` — chronological implementation log (T1–T164)
- `docs/TEST_COVERAGE_MATRIX.md` — requirement-to-test coverage matrix
- `docs/QA_SELF_AUDIT.md` — E2E/UAT audit notes
- `docs/LOAD_TEST_RESULTS.md` / `docs/LOAD_TEST_COVERAGE_MATRIX.md` — load test results

---

## Features

### Messaging
- Public and private rooms with Owner / Admin / Member role hierarchy
- One-to-one DMs restricted to mutual friends
- Reply-to / quote block displayed in both room and DM threads
- Infinite scroll with cursor-based pagination (`SentAt DESC, Id DESC`)
- Message edit and soft-delete
- File and image attachments with backend access-control checks

### Presence
- Online / AFK / Offline status tracked per-user across multiple tabs
- Client-driven AFK: `SetAfk()` / `SetActive()` hub methods, < 2 s SLA
- Live room member sidebar with real-time status dots
- Presence snapshotted at room join; reconciled via `MemberJoined` / `MemberLeft` hub events

### Social
- Friends / contacts system with request / confirm / decline workflow
- User-to-user blocking (freezes DM channel bidirectionally)
- Unread notification counters per room and per dialog

### Moderation
- **Three strictly separated ban types:**
  - **Platform bans** — global 403, enforced via Redis `ban:{userId}` key
  - **Room bans** — per-room, enforced in membership checks
  - **User blocks** — user-to-user, no global effect
- Room admin / owner promotion and demotion
- `BanMember` atomically inserts the ban record and evicts the membership in a single explicit database transaction, then pushes `RemovedFromRoom` to the banned user's active SignalR connections

### Auth & Sessions
- JWT access tokens (15 min) + Redis session gate for instant revocation
- Refresh token rotation
- Argon2id password hashing
- Password reset via email token

### File Storage
- `IFileStorage` abstraction — `LocalFileStorage` ships by default; swap to S3 at the DI registration point
- Orphan cleanup service runs as a hosted background service
- Attachment access validated against PostgreSQL room/dialog membership before serving

### Activity Logging
- All significant domain events published to RabbitMQ fanout exchange
- `ActivityConsumer` hosted service persists events to the `ActivityLogs` table (jsonb payload)
- Background services expose `internal static` testable-core methods so unit tests run without AMQP infrastructure

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend API | .NET 10 Minimal APIs |
| Real-time | ASP.NET Core SignalR (PresenceHub + ChatHub) |
| ORM | Entity Framework Core 10 + Npgsql |
| Database | PostgreSQL 17 |
| Cache / presence | Redis 7 |
| Message broker | RabbitMQ 3.13 |
| Frontend | Angular 21 — Signals, Standalone Components, Control Flow |
| Styling | Tailwind CSS + PrimeNG primitives + CSS custom properties |
| E2E/UAT | Playwright + TypeScript |
| Load testing | k6 + SignalR WebSocket helpers |
| Runtime | Podman Compose locally; Docker Compose in GitHub Actions |

---

## Repository Layout

```text
.
├── src/
│   ├── ChatHerder.Domain/          # Entities, enums, domain model
│   ├── ChatHerder.Application/     # DTOs, IFileStorage, IMessageBus ports
│   ├── ChatHerder.Infrastructure/  # EF Core, Redis, RabbitMQ, LocalFileStorage
│   └── ChatHerder.API/             # Minimal API endpoints, SignalR hubs, DI wiring
├── frontend/                       # Angular 21 SPA
├── tests/
│   ├── ChatHerder.Unit.Tests/      # xUnit + NSubstitute — no I/O, 100 tests
│   └── ChatHerder.Integration.Tests/ # xUnit + Testcontainers (Postgres + Redis), 2 tests
├── e2e/                            # Playwright E2E/UAT (11 spec files)
├── docs/                           # Coverage matrices, audit notes, load test results
├── designs/                        # Static HTML mockups and CSS token reference
├── docker-compose.yml
├── ARCHITECTURE.md
├── DESIGN.md
├── AGENT.md
└── DEVELOPMENT_LOG.md
```

---

## Quick Start With Podman

Prerequisites: Podman 5+, `podman compose` support, 4 GB free RAM, 3 GB free disk.

```bash
cp .env.template .env
# fill every <CHANGE_ME> value in .env
podman compose up --build -d
podman compose ps
```

This starts the five core services: PostgreSQL, Redis, RabbitMQ, backend API, and frontend Nginx. No test runners are included.

| Endpoint | URL |
|---|---|
| App | `http://localhost` |
| Alternate frontend port | `http://localhost:4200` |

Backend traffic is proxied through the frontend Nginx container via `/api/*` and `/hubs/*`.

> **RabbitMQ management UI** (`http://localhost:15672`) is exposed only when `docker-compose.override.yml` is present (local development). It is not bound in production or CI.

For detailed container operations see `DOCKER_SETUP.md`.

---

## Local Development

Backend:

```bash
dotnet restore ChatHerder.sln
dotnet build ChatHerder.sln
dotnet test ChatHerder.sln
```

Frontend:

```bash
cd frontend
npm install
npm start
```

The Angular dev server uses `frontend/proxy.config.json` to forward `/api/*` and `/hubs/*` to the backend.

---

## Tests

Each test suite is invoked independently. `podman compose up` never starts a test runner automatically.

GitHub Actions runs the .NET unit suite, Angular unit suite, and Dockerized E2E/UAT suite on every push to `main`.

**.NET unit + integration:**

```bash
dotnet test ChatHerder.sln
```

**Frontend unit (Vitest):**

```bash
cd frontend
npm test
```

**E2E / UAT (Playwright) — against a running app:**

```bash
# 1. Start the app (if not already running)
podman compose up --build -d

# 2. Run the full suite
npm --prefix e2e install
BASE_URL=http://localhost npm --prefix e2e run test:all
```

**E2E / UAT — fully containerised (CI mode):**

```bash
podman compose --profile e2e up --build e2e
```

Reports land under `./e2e-reports/latest/`: `summary.md`, `manifest.json`, `results.json`, `junit.xml`, and `html/index.html`. Each run is also archived under `runs/e2e-uat-YYYYMMDDTHHMMSSZ/`.

**Load test (k6 — requires the app to be running):**

```bash
podman compose --profile load run load-tester
```

The harness lives in `tests/load/` and targets authenticated SignalR messaging and presence flows at 300 concurrent users.

---

## Architecture Notes

### Clean Architecture

```
Domain ← Application ← Infrastructure ← API
```

- `Domain` — zero external dependencies; pure entities and port interfaces
- `Application` — use cases, DTOs, `IFileStorage`, `IMessageBus`
- `Infrastructure` — EF Core, Redis, RabbitMQ, `LocalFileStorage`
- `API` — Minimal API endpoints, SignalR hubs, dependency wiring

### Non-Obvious Design Decisions

**Cursor-based pagination** — message history uses a `(SentAt DESC, Id DESC)` composite index and cursor tokens rather than `OFFSET`. `MAX()+1` sequence allocation is explicitly rejected; `ContextSequences` use `UPDATE … RETURNING` for atomic ordering.

**ContextSequences** — each room and dialog maintains a monotonic sequence counter. Sequence allocation happens as a single `UPDATE … RETURNING` statement to avoid race conditions under concurrent sends.

**PersonalDialog user ordering** — `User1Id < User2Id` is enforced in the Application layer so that a pair of users always maps to exactly one dialog row, regardless of who initiates.

**IFileStorage abstraction** — `LocalFileStorage` is registered at startup. Switching to S3 is a one-line DI change. Attachment access is validated against PostgreSQL room/dialog membership before serving the file byte stream.

**Redis session gate** — the JWT lifetime is 15 minutes, but a `sessions:valid:{userId}` Redis Set provides instant revocation without waiting for token expiry. Every authenticated request checks the Set.

**client-driven AFK** — the browser calls `SetAfk()` / `SetActive()` hub methods; the server never infers idle status. This keeps server-side logic simple and gives the client full control over the < 2 s SLA.

**Angular Signals only** — no RxJS `BehaviorSubject` or `Subject` for component state. All reactive state is `signal<T>()` / `computed()` / `effect()`. Signal reads inside `effect()` that should not trigger re-runs are wrapped in `untracked()`.

**Unit-testable Minimal API handlers** — each endpoint delegate is a private static method exposed as `internal static XxxInternal(...)` for unit tests. `InternalsVisibleTo` is configured in `Directory.Build.props`. This avoids spinning up `WebApplicationFactory` for logic-only tests.

**EF Core raw SQL atomicity** — `ExecuteDeleteAsync` issues raw SQL with its own implicit transaction and does not participate in an ambient `SaveChangesAsync` transaction. Any operation that mixes tracked inserts with raw deletes wraps both in an explicit `BeginTransactionAsync` / `CommitAsync`.

### Security Model

- JWT access tokens (15 min) + Redis session gate for instant revocation
- Argon2id password hashing
- Three independent ban tiers: platform (`ban:{userId}` Redis key), room, and user-block
- PostgreSQL-backed authorization for file access (room/dialog membership check)
- SignalR JWT transport via `?access_token=` query string (required by browser WebSocket)

---

## Design System

Frontend implementation follows `DESIGN.md` and the static references in `designs/*.html`.

Core frontend constraints:

- Angular standalone components only
- Angular Signals for all reactive state
- Tailwind CSS plus restyled PrimeNG primitives
- CSS custom properties from `designs/tokens.css` — no hardcoded hex values in components
- Stable `data-testid` selectors for all E2E flows

---

## Primary References

| Document | Purpose |
|---|---|
| `requirements.md` | Product requirements |
| `ARCHITECTURE.md` | Full system architecture and API design |
| `DESIGN.md` | UI design system rules |
| `AGENT.md` | Repository engineering rules for AI coding agents |
| `DOCKER_SETUP.md` | Docker/Podman operations |
| `DEVELOPMENT_LOG.md` | Chronological implementation log |
| `TESTING_SETUP.md` | Playwright E2E `data-testid` contracts |
| `e2e/README.md` | E2E/UAT runner details |
| `designs/*.html` | Pixel-accurate screen mockups |
