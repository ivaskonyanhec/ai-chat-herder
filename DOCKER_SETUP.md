# Docker Setup — AI Chat Herder

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Docker Engine | ≥ 25 |
| Docker Compose V2 | (`docker compose`, not `docker-compose`) |
| Free RAM | ≥ 4 GB |
| Free Disk | ≥ 3 GB (images + volumes) |

---

## Quick Start

```bash
# 1. Copy and fill in secrets
cp .env.template .env
# Open .env and replace every <CHANGE_ME> value

# 2. Build images and start all services
docker compose up --build -d

# 3. Confirm services are healthy
docker compose ps

# 4. Tail backend logs (EF Core migrations appear here on first start)
docker compose logs -f backend
```

The app is available at **http://localhost** once the frontend service starts.

---

## Services and Ports

| Service | Internal Port | Host Port | URL |
|---------|--------------|-----------|-----|
| frontend (Nginx) | 80 | **80**, 4200 | http://localhost |
| backend (.NET 10) | 8080 | — internal | via Nginx `/api/` and `/hubs/` |
| postgres | 5432 | — internal | — |
| redis | 6379 | — internal | — |
| rabbitmq | 5672 | — internal | — |
| rabbitmq (mgmt) | 15672 | **15672** | http://localhost:15672 |

> **Security note:** The backend is not published to the host. All browser traffic reaches it through the Nginx reverse proxy. The RabbitMQ management UI (port 15672) is exposed for development convenience — remove its `ports:` entry in production.

---

## Volume Map

| Docker Volume | Mount Path | Content |
|---------------|-----------|---------|
| `postgres_data` | PostgreSQL data dir | All relational data (messages, memberships, sessions) |
| `redis_data` | Redis `/data` | Presence/unread counters (AOF persistence) |
| `rabbitmq_data` | RabbitMQ data dir | Durable queues and exchange definitions |
| `uploads` | `/app/uploads` (backend) | Message attachment files served via `GET /api/files/{id}` |

Volumes survive `docker compose down` and `docker compose up --build`. They are **only** deleted with `docker compose down -v`.

---

## Database Migrations

EF Core migrations run automatically when the backend starts (`app.MigrateAsync()` in `Program.cs`). The backend service uses `depends_on: condition: service_healthy`, so it waits for PostgreSQL to accept connections before starting.

To inspect migration output:

```bash
docker compose logs backend | grep -iE "migration|applying|error"
```

---

## Common Operations

```bash
# Rebuild only the backend after .NET code changes
docker compose up --build -d backend

# Rebuild only the frontend after Angular changes
docker compose up --build -d frontend

# Open a PostgreSQL shell
docker compose exec postgres psql -U chatherder -d chatherder

# Open a Redis CLI session
docker compose exec redis redis-cli -a <REDIS_PASSWORD>

# Reset everything (WARNING: deletes all database data and uploads)
docker compose down -v
docker compose up --build -d
```

---

## Generating a JWT Secret

```bash
openssl rand -base64 64
```

Paste the output into `JWT_SECRET_KEY` in `.env`. The key must be at least 32 bytes; 48+ bytes is recommended for HS256/HS512.

---

## Local SMTP for Password Reset Testing

Run [MailHog](https://github.com/mailhog/MailHog) alongside the stack:

```bash
docker run -d -p 1025:1025 -p 8025:8025 --name mailhog mailhog/mailhog
```

Then set in `.env`:

```dotenv
SMTP_HOST=host.docker.internal
SMTP_PORT=1025
SMTP_USERNAME=
SMTP_PASSWORD=
```

View sent emails at **http://localhost:8025**.

---

## Stopping

```bash
# Stop services, keep data volumes intact
docker compose down

# Stop services and delete all volumes (full reset)
docker compose down -v
```
