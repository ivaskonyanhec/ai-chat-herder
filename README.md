# AI Chat Herder

[![CI](https://github.com/ivaskonyanhec/ai-chat-herder/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ivaskonyanhec/ai-chat-herder/actions/workflows/ci.yml)
![.NET 10](https://img.shields.io/badge/.NET-10-512BD4)
![Angular 21](https://img.shields.io/badge/Angular-21-DD0031)
![E2E/UAT Playwright](https://img.shields.io/badge/E2E%2FUAT-Playwright-2EAD33)

AI Chat Herder is a classic web-based real-time chat application built around public/private rooms, direct messages, friends, file sharing, moderation, persistent history, unread notifications, and multi-tab presence.

The project targets moderate scale: 300 simultaneous users, up to 1,000 participants per room, and a typical user profile of roughly 20 rooms and 50 contacts.

## Status

This repository is under active implementation. Architecture and design decisions are documented, core backend and frontend pieces are in progress, and QA coverage is being tracked separately.

Current QA implementation-readiness estimate: 42.9%, based on `docs/TEST_COVERAGE_MATRIX.md`.

Useful status documents:

- `DEVELOPMENT_LOG.md` - chronological implementation and QA log
- `docs/TEST_COVERAGE_MATRIX.md` - requirement-to-test coverage
- `docs/QA_SELF_AUDIT.md` - E2E/UAT audit notes
- `docs/LOAD_TEST_RESULTS.md` - load-test execution record
- `docs/LOAD_TEST_COVERAGE_MATRIX.md` - load-test coverage mapping
- `docs/LOAD_TEST_SELF_AUDIT.md` - load-test audit notes

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend API | .NET 10 Minimal APIs |
| Real-time | ASP.NET Core SignalR |
| ORM | Entity Framework Core 10 + Npgsql |
| Database | PostgreSQL 17 |
| Cache / presence | Redis 7 |
| Message broker | RabbitMQ 3.13 |
| Frontend | Angular 21, Signals, Standalone Components, Tailwind CSS, PrimeNG |
| E2E/UAT | Playwright + TypeScript |
| Load testing | k6 + SignalR WebSocket helpers |
| Runtime | Podman Compose locally; Docker Compose in GitHub Actions |

## Repository Layout

```text
.
├── src/
│   ├── ChatHerder.Domain/          # Entities, enums, domain model
│   ├── ChatHerder.Application/     # DTOs and application ports
│   ├── ChatHerder.Infrastructure/  # EF Core, Redis, security, email adapters
│   └── ChatHerder.API/             # Minimal APIs, middleware, SignalR hubs
├── frontend/                       # Angular 21 SPA
├── tests/                          # .NET unit/integration tests and k6 load tests
├── e2e/                            # Playwright E2E/UAT tests
├── docs/                           # QA, coverage, and planning documents
├── designs/                        # Static HTML design references and tokens
├── docker-compose.yml
├── ARCHITECTURE.md
├── DESIGN.md
├── DOCKER_SETUP.md
└── requirements.md
```

## Quick Start With Podman

Prerequisites:

- Podman 5+
- `podman compose` support, or the `podman-compose` compatibility package
- At least 4 GB free RAM
- At least 3 GB free disk space

```bash
cp .env.template .env
```

Fill in every `<CHANGE_ME>` value in `.env`, then start the stack:

```bash
podman compose up --build -d
podman compose ps
```

The app is served through the frontend container:

- App: `http://localhost`
- Alternate frontend port: `http://localhost:4200`
- RabbitMQ management UI: `http://localhost:15672`

Backend traffic is routed through the frontend Nginx proxy via `/api/*` and `/hubs/*`; the backend container is not published directly to the host.

The Compose file is Docker-compatible for CI, but local commands in this README use Podman.
For detailed container operations, see `DOCKER_SETUP.md`.

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

The Angular dev server uses `frontend/proxy.config.json` for API and SignalR proxying.

## Tests

GitHub Actions runs the .NET unit suite, Angular unit suite, and Dockerized E2E/UAT suite on every push to `main`.

.NET tests:

```bash
dotnet test ChatHerder.sln
```

Frontend tests:

```bash
cd frontend
npm test
```

E2E/UAT tests:

```bash
podman compose up --build -d
npm --prefix e2e install
BASE_URL=http://localhost npm --prefix e2e run test:all
```

Podman E2E run:

```bash
podman compose --profile e2e up --build e2e
```

Reports are organized for agent handoff under `./e2e-reports`:

- `latest/summary.md` and `latest/manifest.json` are the first triage files.
- `latest/results.json`, `latest/junit.xml`, and `latest/html/index.html` contain detailed results.
- `latest/artifacts/` contains retained traces, videos, and screenshots.
- `runs/e2e-uat-YYYYMMDDTHHMMSSZ/` archives each historical run.

Load test:

```bash
podman compose run load-tester
```

The load harness lives in `tests/load/` and currently targets authenticated SignalR messaging/presence flows.

## Architecture Notes

The backend follows a Clean Architecture layout:

- `Domain` has no external dependencies.
- `Application` depends on `Domain` and defines ports.
- `Infrastructure` implements persistence, Redis, security, and adapter concerns.
- `API` hosts Minimal API endpoints, middleware, and SignalR hubs.

Security-sensitive rules are documented in `ARCHITECTURE.md` and `AGENT.md`, including:

- JWT access tokens with refresh-token-backed sessions
- Argon2id password hashing
- Redis-backed session validation
- platform, room, and user-ban separation
- PostgreSQL-backed authorization for room/dialog file access
- SignalR JWT transport through `?access_token=`

## Design System

Frontend implementation follows `DESIGN.md` and the static references in `designs/*.html`.

Core frontend constraints:

- Angular standalone components only
- Angular Signals for component state
- Tailwind CSS plus restyled PrimeNG primitives
- CSS custom properties from `designs/tokens.css`
- stable `data-testid` selectors for E2E flows

## Primary References

- `requirements.md` - product requirements
- `ARCHITECTURE.md` - system architecture and API design
- `DESIGN.md` - UI design system
- `DOCKER_SETUP.md` - Docker setup and operations
- `AGENT.md` - repository engineering rules for AI coding agents
- `e2e/README.md` - E2E/UAT runner details
