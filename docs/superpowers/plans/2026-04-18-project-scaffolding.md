# Project Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize a .NET 10 Clean Architecture solution (`src/`) and an Angular 21 standalone SPA (`frontend/`) so that `docker compose up` produces a running, health-checked stack.

**Architecture:** Four-layer Clean Architecture backend (Domain → Application → Infrastructure → API) with strict dependency rules enforced via project references. Angular 21 standalone SPA served through Nginx reverse-proxy; no server-side rendering. Dockerfiles already exist and expect `ChatHerder.sln` at repo root and `frontend/dist/chat-herder` as the build output.

**Tech Stack:** .NET 10 · C# 14 · EF Core 10 · Npgsql · StackExchange.Redis · RabbitMQ.Client · Konscious.Security.Cryptography · ASP.NET Core SignalR · Angular 21 · TypeScript 5 · SCSS · Nginx

---

## File Map

### Backend — created / scaffolded

| File | Responsibility |
|------|---------------|
| `ChatHerder.sln` | Solution file listing all 4 projects |
| `src/ChatHerder.Domain/ChatHerder.Domain.csproj` | No external deps; entities, enums, port interfaces signatures |
| `src/ChatHerder.Application/ChatHerder.Application.csproj` | References Domain; use-case port interfaces |
| `src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj` | References Application; EF Core, Redis, RabbitMQ, Argon2id |
| `src/ChatHerder.API/ChatHerder.API.csproj` | References all layers; Minimal API, SignalR, JWT |
| `src/ChatHerder.API/Program.cs` | DI wiring skeleton + `/api/health` endpoint |
| `src/ChatHerder.API/appsettings.json` | Blank/structural config (no secrets) |
| `src/ChatHerder.Domain/Common/Result.cs` | `Result<T, Error>` type used throughout Application |

### Frontend — scaffolded via `ng new`

| File | Responsibility |
|------|---------------|
| `frontend/angular.json` | Build config; `outputPath` must be `dist/chat-herder` |
| `frontend/package.json` | Angular 21 deps |
| `frontend/tsconfig.json` | `strict: true`, no `any` |
| `frontend/src/styles.scss` | Global styles; imports `designs/tokens.css` |
| `frontend/src/app/app.component.ts` | Root standalone component |
| `frontend/src/app/app.config.ts` | `provideRouter`, `provideHttpClient` bootstrap |

---

## Task 1: Backend — Scaffold solution and four projects

**Prerequisite:** .NET 10 SDK installed (`dotnet --version` returns `10.x.x`)

**Files:**
- Create: `ChatHerder.sln`
- Create: `src/ChatHerder.Domain/ChatHerder.Domain.csproj`
- Create: `src/ChatHerder.Application/ChatHerder.Application.csproj`
- Create: `src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj`
- Create: `src/ChatHerder.API/ChatHerder.API.csproj`

- [ ] **Step 1: Verify .NET 10 SDK**

```bash
dotnet --version
# Expected: 10.x.x
```

- [ ] **Step 2: Create solution**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet new sln -n ChatHerder
```

- [ ] **Step 3: Create Domain project**

```bash
dotnet new classlib -n ChatHerder.Domain \
  -o src/ChatHerder.Domain \
  --framework net10.0
rm src/ChatHerder.Domain/Class1.cs
dotnet sln add src/ChatHerder.Domain/ChatHerder.Domain.csproj
```

- [ ] **Step 4: Create Application project**

```bash
dotnet new classlib -n ChatHerder.Application \
  -o src/ChatHerder.Application \
  --framework net10.0
rm src/ChatHerder.Application/Class1.cs
dotnet sln add src/ChatHerder.Application/ChatHerder.Application.csproj
```

- [ ] **Step 5: Create Infrastructure project**

```bash
dotnet new classlib -n ChatHerder.Infrastructure \
  -o src/ChatHerder.Infrastructure \
  --framework net10.0
rm src/ChatHerder.Infrastructure/Class1.cs
dotnet sln add src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj
```

- [ ] **Step 6: Create API project (Minimal API, no controllers)**

```bash
dotnet new web -n ChatHerder.API \
  -o src/ChatHerder.API \
  --framework net10.0
dotnet sln add src/ChatHerder.API/ChatHerder.API.csproj
```

- [ ] **Step 7: Verify solution builds with zero errors**

```bash
dotnet build ChatHerder.sln
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 8: Commit**

```bash
git add ChatHerder.sln src/
git commit -m "chore: scaffold .NET 10 Clean Architecture solution (4 projects)"
```

---

## Task 2: Backend — Project references and NuGet packages

**Files:**
- Modify: `src/ChatHerder.Application/ChatHerder.Application.csproj`
- Modify: `src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj`
- Modify: `src/ChatHerder.API/ChatHerder.API.csproj`
- Modify: `src/ChatHerder.Domain/ChatHerder.Domain.csproj`

- [ ] **Step 1: Enable Nullable on Domain**

```bash
# Edit src/ChatHerder.Domain/ChatHerder.Domain.csproj
# Add inside <PropertyGroup>:
#   <Nullable>enable</Nullable>
#   <ImplicitUsings>enable</ImplicitUsings>
```

The final `ChatHerder.Domain.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
```

- [ ] **Step 2: Add Application → Domain reference**

```bash
dotnet add src/ChatHerder.Application/ChatHerder.Application.csproj \
  reference src/ChatHerder.Domain/ChatHerder.Domain.csproj
```

Final `ChatHerder.Application.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\ChatHerder.Domain\ChatHerder.Domain.csproj" />
  </ItemGroup>
</Project>
```

- [ ] **Step 3: Add Infrastructure → Application + NuGet packages**

```bash
dotnet add src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj \
  reference src/ChatHerder.Application/ChatHerder.Application.csproj

dotnet add src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj \
  package Microsoft.EntityFrameworkCore --version 10.0.0

dotnet add src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj \
  package Npgsql.EntityFrameworkCore.PostgreSQL --version 10.0.0

dotnet add src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj \
  package StackExchange.Redis --version 2.8.16

dotnet add src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj \
  package RabbitMQ.Client --version 7.1.2

dotnet add src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj \
  package Konscious.Security.Cryptography.Argon2 --version 1.3.1

dotnet add src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj \
  package Microsoft.Extensions.Options --version 10.0.0
```

- [ ] **Step 4: Add API → all layers + NuGet packages**

```bash
dotnet add src/ChatHerder.API/ChatHerder.API.csproj \
  reference src/ChatHerder.Infrastructure/ChatHerder.Infrastructure.csproj

dotnet add src/ChatHerder.API/ChatHerder.API.csproj \
  reference src/ChatHerder.Application/ChatHerder.Application.csproj

dotnet add src/ChatHerder.API/ChatHerder.API.csproj \
  reference src/ChatHerder.Domain/ChatHerder.Domain.csproj

dotnet add src/ChatHerder.API/ChatHerder.API.csproj \
  package Microsoft.AspNetCore.Authentication.JwtBearer --version 10.0.0

dotnet add src/ChatHerder.API/ChatHerder.API.csproj \
  package Microsoft.EntityFrameworkCore.Design --version 10.0.0

dotnet add src/ChatHerder.API/ChatHerder.API.csproj \
  package Swashbuckle.AspNetCore --version 8.1.0
```

- [ ] **Step 5: Restore and build to verify references resolve**

```bash
dotnet restore ChatHerder.sln
dotnet build ChatHerder.sln
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "chore: add project references and NuGet packages for all layers"
```

---

## Task 3: Backend — Result type + Program.cs skeleton

**Files:**
- Create: `src/ChatHerder.Domain/Common/Result.cs`
- Modify: `src/ChatHerder.API/Program.cs`
- Create: `src/ChatHerder.API/appsettings.json`

- [ ] **Step 1: Create Result<T, Error> in Domain**

Create `src/ChatHerder.Domain/Common/Result.cs`:

```csharp
namespace ChatHerder.Domain.Common;

public sealed class Result<TValue, TError>
{
    private readonly TValue? _value;
    private readonly TError? _error;

    public bool IsSuccess { get; }
    public TValue Value => IsSuccess ? _value! : throw new InvalidOperationException("Result is a failure.");
    public TError Error  => !IsSuccess ? _error! : throw new InvalidOperationException("Result is a success.");

    private Result(TValue value)  { _value = value; IsSuccess = true; }
    private Result(TError error)  { _error = error; IsSuccess = false; }

    public static Result<TValue, TError> Ok(TValue value)    => new(value);
    public static Result<TValue, TError> Fail(TError error)  => new(error);

    public TResult Match<TResult>(Func<TValue, TResult> onSuccess, Func<TError, TResult> onFailure)
        => IsSuccess ? onSuccess(_value!) : onFailure(_error!);
}
```

- [ ] **Step 2: Write minimal Program.cs**

Replace `src/ChatHerder.API/Program.cs` entirely:

```csharp
using ChatHerder.API;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// SignalR — required by PresenceHub and ChatHub (AGENT.md §10)
builder.Services.AddSignalR();

// Authentication — JWT (AGENT.md §7); details wired in Phase 2
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();

var app = builder.Build();

// Middleware pipeline — strict order per AGENT.md §5
app.UseAuthentication();
// BanCheckMiddleware   — added in Phase 2
// SessionValidationMiddleware — added in Phase 2
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Health check — required by docker-compose healthcheck (docker-compose.yml line 68)
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
   .AllowAnonymous();

app.Run();

// Make Program visible to integration test projects
public partial class Program { }
```

- [ ] **Step 3: Create appsettings.json (no secrets)**

Create `src/ChatHerder.API/appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "Jwt": {
    "Issuer": "",
    "Audience": ""
  },
  "Storage": {
    "BasePath": "/app/uploads"
  },
  "Smtp": {
    "Port": 587
  }
}
```

- [ ] **Step 4: Build and run health endpoint locally**

```bash
dotnet build src/ChatHerder.API/ChatHerder.API.csproj
dotnet run --project src/ChatHerder.API/ChatHerder.API.csproj &
sleep 3
curl -s http://localhost:5000/api/health
# Expected: {"status":"healthy","timestamp":"..."}
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add src/ChatHerder.Domain/Common/Result.cs \
        src/ChatHerder.API/Program.cs \
        src/ChatHerder.API/appsettings.json
git commit -m "feat: add Result type, Program.cs skeleton, and /api/health endpoint"
```

---

## Task 4: Frontend — Scaffold Angular 21 standalone project

**Files:**
- Create: `frontend/angular.json`, `frontend/package.json`, `frontend/tsconfig.json`
- Create: `frontend/src/app/app.component.ts`, `frontend/src/app/app.config.ts`
- Create: `frontend/src/styles.scss`

- [ ] **Step 1: Scaffold inside frontend/ (replace existing empty dir)**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder

# Temporarily move existing Dockerfile and nginx.conf out
cp frontend/Dockerfile /tmp/Dockerfile.frontend.bak
cp frontend/nginx.conf /tmp/nginx.conf.bak

# Scaffold Angular 21 into a temp dir then merge
ng new chat-herder \
  --directory frontend \
  --standalone \
  --routing \
  --style scss \
  --ssr false \
  --skip-git \
  --skip-tests=false \
  --strict

# Restore Docker artifacts (ng new would have overwritten only what it creates)
cp /tmp/Dockerfile.frontend.bak frontend/Dockerfile
cp /tmp/nginx.conf.bak          frontend/nginx.conf
```

- [ ] **Step 2: Verify outputPath in angular.json**

```bash
grep -A3 '"outputPath"' frontend/angular.json
# Must contain: "dist/chat-herder"
# If different, edit angular.json to set "outputPath": "dist/chat-herder"
```

- [ ] **Step 3: Enable strict TypeScript**

`frontend/tsconfig.json` must have:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

Verify with:
```bash
grep '"strict"' frontend/tsconfig.json
# Expected: "strict": true
```

- [ ] **Step 4: Wire tokens.css into global styles**

Edit `frontend/src/styles.scss` to add as first line:

```scss
@import url('/tokens.css');
```

Then copy the design token file so it's available in dev:

```bash
cp /Users/igorvaskonyan/projects/ai/ai-chat-herder/designs/tokens.css \
   /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend/public/tokens.css
```

And add to `frontend/angular.json` assets array:

```json
"assets": [
  "src/favicon.ico",
  "src/assets",
  { "glob": "tokens.css", "input": "public", "output": "/" }
]
```

- [ ] **Step 5: Verify Angular builds**

```bash
cd frontend && npm run build -- --configuration production
# Expected: ✔ Browser application bundle generation complete.
#           Output at: dist/chat-herder/
cd ..
```

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Angular 21 standalone SPA with strict TypeScript and design tokens"
```

---

## Task 5: Verify Docker build end-to-end

**Prerequisite:** Docker Desktop running.

- [ ] **Step 1: Copy `.env.template` to `.env` with test values**

```bash
cp .env.template .env
# Edit .env — fill in placeholder values:
# POSTGRES_DB=chatherder_dev
# POSTGRES_USER=chatuser
# POSTGRES_PASSWORD=chatpass_dev
# REDIS_PASSWORD=redispass_dev
# RABBITMQ_USER=rabbit
# RABBITMQ_PASSWORD=rabbitpass_dev
# RABBITMQ_VHOST=chatherder
# JWT_SECRET_KEY=dev_secret_min_32_chars_xxxxxxxxxx
# JWT_ISSUER=http://localhost
# JWT_AUDIENCE=http://localhost
# SMTP_HOST=localhost
# SMTP_PORT=587
# SMTP_USERNAME=test@test.com
# SMTP_PASSWORD=test
# SMTP_FROM_ADDRESS=noreply@test.com
# ASPNETCORE_ENVIRONMENT=Development
```

- [ ] **Step 2: Build backend image**

```bash
docker build -f Dockerfile.backend -t chatherder-backend:local .
# Expected: Successfully built <sha>
```

- [ ] **Step 3: Build frontend image**

```bash
docker build -f frontend/Dockerfile -t chatherder-frontend:local frontend/
# Expected: Successfully built <sha>
```

- [ ] **Step 4: Bring up full stack**

```bash
docker compose up -d postgres redis rabbitmq backend frontend
docker compose ps
# Expected: All 5 services "healthy" or "running"
```

- [ ] **Step 5: Smoke-test health endpoint through Nginx proxy**

```bash
curl -s http://localhost/api/health
# Expected: {"status":"healthy","timestamp":"..."}
```

- [ ] **Step 6: Tear down and commit**

```bash
docker compose down
git add .env.template   # only if updated; never commit .env
git commit -m "chore: verify full Docker Compose stack builds and health-checks pass"
```

---

## Self-Review

### Spec Coverage

| AGENT.md Requirement | Covered by Task |
|---|---|
| Clean Architecture 4 layers (§5) | Task 1 |
| Domain → no external deps (§3.1) | Task 2 (csproj has zero PackageReferences) |
| `<Nullable>enable</Nullable>` all projects (§3.1) | Task 2 |
| Result pattern (§3.1) | Task 3 |
| Minimal API only, no controllers (§3.1) | Task 1 (`dotnet new web`, not `webapi`) |
| `/api/health` for docker-compose healthcheck | Task 3 |
| `ASPNETCORE_URLS: http://+:8080` (docker-compose) | Task 3 — Program.cs respects env var |
| Angular strict TypeScript (§3.2) | Task 4 |
| Standalone components, no NgModules (§3.2) | Task 4 (`--standalone`) |
| `designs/tokens.css` via CSS custom properties (§3.2) | Task 4 |
| Docker-first, no hardcoded localhost (§3.3) | Task 5 (docker-compose.yml uses container DNS) |

### Type Consistency

- `Result<TValue, TError>` — defined in Task 3 `Result.cs`; referenced by Application use cases in future phases.
- `Program` class exposed as `partial` in Task 3 — required pattern for WebApplicationFactory in integration tests.

### No Placeholders

All steps contain exact commands or exact code. No "TBD" entries.
