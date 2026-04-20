Testing & Evaluation Report

Generated: 2026-04-20 | Evaluated by: Claude Code (T207–T209 evaluation run)

---

## 1. Functional Validation

### Unit & Integration Tests

| Suite | Result | Count | Command |
|---|---|---|---|
| .NET unit | ✅ PASS | 142/142 | `dotnet test ChatHerder.sln` |
| .NET integration | ✅ PASS | 2/2 | `dotnet test ChatHerder.sln` |
| Angular unit | ✅ PASS | 238/238 (34 spec files) | `cd frontend && npm test` |

.NET build: **1 pre-existing error** (integration test uses deprecated `RedisBuilder()` constructor; not a blocker — tests still run and pass).  
Angular production bundle: ~850 kB — ⚠️ exceeds 800 kB budget; below 1 MB error threshold.

### Bugs found and fixed during this evaluation run

| # | File | Root cause | Fix |
|---|---|---|---|
| B1 | `avatar.component.spec.ts` | Mock returned raw `Promise` instead of Observable; `.pipe()` call failed | Replaced `new Promise(() => {})` with `NEVER` from rxjs |
| B2 | `FilesEndpoints.cs` | `text/html` and `image/svg+xml` in block list prevented legitimate uploads | Removed from `BlockedMimeTypes`; SVG excluded from binary magic-byte check |
| B3 | `room-chat.ts`, `direct-messages.ts` | Upload error handler used generic string; API error detail was swallowed | Propagates `err.error?.error` message to `errorMessage` signal |

### E2E / Playwright (142 tests total)

| Result | Count |
|---|---|
| ✅ Pass | 138 |
| ❌ Fail (pre-existing) | 4 |

**Exit code: 1** — 4 pre-existing failures, none caused by this session's changes.

### Pre-existing E2E failures (unrelated to today's work)

| Test | Root cause | Status |
|---|---|---|
| `12-avatar-icons` — icon appears as navbar avatar after navigation | Avatar URL lost in session after SPA navigation | Pre-existing, not regressed today |
| `uat/09-profile-settings` — avatar upload updates profile | Test checks `src` on `<div>` wrapper instead of `<img>` inside `<app-avatar>` | Pre-existing test assertion bug |
| `uat/10-sidebar-profile` — initials in collapsed sidebar | `api.joinRoom` called after `api.createRoom`; user already member → 409 | Pre-existing test isolation flaw |
| `uat/10-sidebar-profile` — icon updates navbar immediately | Same session as above; setup failure cascades | Pre-existing |

### UAT Scenario Results

| Spec | Tests | Status |
|---|---|---|
| 01-onboarding | 2 | ✅ |
| 02-multitab-afk | 2 (1 intentionally skipped) | ✅ |
| 03-realtime-messaging | 3 | ✅ |
| 04-moderation | 2 | ✅ |
| 05-file-security | 2 | ✅ |
| 06-dm-flow | 2 | ✅ |
| 08-create-room | 3 | ✅ |
| 09-profile-settings | 6/7 (1 pre-existing fail) | ⚠️ |
| 10-sidebar-profile | 1/3 (2 pre-existing fail) | ⚠️ |
| 10-security-hardening | 4 | ✅ |
| 11-password-reset | 4 | ✅ |

---

## 2. Performance & Scale

| Metric | Target | Actual |
|---|---|---|
| Simultaneous users | 300 | NOT RUN — see note |
| p95 latency | < 3 000 ms | NOT RUN |
| Success rate | > 99% | NOT RUN |

**Note:** k6 load-tester service is implemented (`tests/load/`) but requires Docker/k6 to be available.
Run with: `podman compose --profile load run load-tester`

---

## 3. Security Audit

| Area | Status | Evidence |
|---|---|---|
| Authentication | ✅ | JWT (15 min) + opaque refresh token (7-day), HttpOnly cookie path |
| Password hashing | ✅ | Argon2id; constant-time verification — sentinel hash prevents timing attack (T63) |
| Session management | ✅ | Per-device revocation; Redis `sessions:valid:{userId}` instant invalidation |
| Ban enforcement | ✅ | Redis ban gate; immediate ForceDisconnect on ban |
| File access | ✅ | `GET /files/{id}` requires JWT Bearer; no public URL bypass |
| File MIME security | ✅ | JS/PHP execution types blocked; raster images validated by magic bytes; SVG/HTML allowed as downloads |
| markersToHtml XSS | ✅ | `escapeHtml()` added as first step (T206 SEC-04) |
| Email PII disclosure | ✅ | `by-username` returns `UserSearchResultDto` without email (T206 SEC-01) |
| Avatar URL scheme | ✅ | Only `/api/files/` and `https://` accepted (T206 SEC-05) |
| .NET compiler | ⚠️ | 1 pre-existing deprecation warning in integration test (`RedisBuilder()`) |
| Debug artifacts | ⚠️ OPEN | T177: `e2e/debug-auth{1..6}.mjs` committed — delete or add to `.gitignore` |
| JWT in WebSocket URL | ⚠️ OPEN | SEC-02: `?access_token=` appears in server access logs — DevOps config item |

---

## 4. AI Orchestration Stats

| Metric | Count |
|---|---|
| Total log entries (agent iterations) | 209 (through T209) |
| Security findings resolved | 4/5 (SEC-01, 03, 04, 05 fixed; SEC-02 is config) |
| New E2E tests added this session | 8 (11-password-reset UI + UAT) |
| Angular unit tests | 238 (+89 since T188) |
| .NET unit tests | 142 (+41 since T188) |

---

## 5. Open Items

| ID | Severity | Description | File |
|---|---|---|---|
| OI-1 | ⚠️ Non-blocking | Angular bundle ~50 kB over 800 kB budget warning | `frontend/angular.json` budgets |
| OI-2 | ℹ️ Low | `userstatuschanged` SignalR client-method warnings in E2E logs | `PresenceService` hub listener registration timing |
| OI-3 | ⚠️ Low | `e2e/debug-auth{1..6}.mjs` debug scripts committed (T177) | `.gitignore` or delete |
| OI-4 | ⚠️ Low | SEC-02: JWT token in WebSocket URL query string appears in server logs | Nginx log config — strip `?access_token=` from `/hubs/*` logs |
| OI-5 | ⚠️ Medium | `avatar.component.spec.ts` — icon persistence across SPA navigation | `AuthSessionService` doesn't re-hydrate avatarUrl from API after nav |
| OI-6 | ⚠️ Medium | `uat/09-profile-settings` — test checks `src` on wrapper `<div>` not `<img>` | Fix assertion to target `[data-testid="avatar-img"]` inside profile-avatar |
| OI-7 | ⚠️ Medium | `uat/10-sidebar-profile` — test calls `joinRoom` after `createRoom` causing 409 | Guard with `try/catch` or skip join if already member |
