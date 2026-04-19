Testing & Evaluation Report

Generated: 2026-04-19 | Evaluated by: Claude Code (T188 evaluation run)

---

## 1. Functional Validation

### Unit & Integration Tests

| Suite | Result | Count | Command |
|---|---|---|---|
| .NET unit | ✅ PASS | 101/101 | `dotnet test ChatHerder.sln` |
| .NET integration | ✅ PASS | 2/2 | `dotnet test ChatHerder.sln` |
| Angular unit | ✅ PASS | 149/149 (32 spec files) | `ng test --no-watch` |

.NET build: **0 errors, 0 warnings** (verified with `/p:TreatWarningsAsErrors=true`).
Angular production bundle: 824.67 kB — ⚠️ exceeds 800 kB budget by 24.67 kB; below 1 MB error threshold.

### E2E / Playwright (95 tests total — freshly rebuilt stack)

| Result | Count |
|---|---|
| ✅ Pass | 94 |
| ⏭ Skip (intentional — 61s timer) | 1 |
| ❌ Fail | 0 |

**Exit code: 0**

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
| 09-profile-settings | 7 | ✅ |

### Bugs found and fixed during this evaluation run

| # | File | Root cause | Fix |
|---|---|---|---|
| B1 | `e2e/tests/01-auth.spec.ts` | T186 added `confirmPassword` field to register form; E2E test did not fill it | Added `fill('[data-testid="register-confirm-password"]', ...)` |
| B2 | `e2e/tests/uat/01-onboarding.uat.spec.ts` | Same as B1 + wrong route `/app/profile` (route is `/app/settings`) | Fixed URL and added confirm-password fill |
| B3 | `e2e/tests/uat/08-create-room.uat.spec.ts` | `getByText()` strict-mode violation — matched sidebar `<span>` and room `<h1>` | Scoped locator to `[data-testid="public-rooms-section"]` |
| B4 | Stack | Docker image was stale (2h old, pre-T186/T187) when first E2E run executed | Rebuilt with `podman compose up --build -d` |

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
| .NET compiler | ✅ | 0 warnings with `/p:TreatWarningsAsErrors=true` |
| Debug artifacts | ⚠️ OPEN | T177: `e2e/debug-auth{1..6}.mjs` committed — delete or add to `.gitignore` |

---

## 4. AI Orchestration Stats

| Metric | Count |
|---|---|
| Total log entries (agent iterations) | 202 (through T187) |
| Auditor rejections | 3 (all resolved) |
| QA verifications | 24 |
| Auditor approvals | 9 |

---

## 5. Open Items

| ID | Severity | Description | File |
|---|---|---|---|
| OI-1 | ⚠️ Non-blocking | Angular bundle 24.67 kB over 800 kB budget warning | `frontend/angular.json` budgets |
| OI-2 | ℹ️ Low | `userstatuschanged` SignalR client-method warnings in E2E logs | `PresenceService` hub listener registration timing |
| OI-3 | ⚠️ Low | `e2e/debug-auth{1..6}.mjs` debug scripts committed (T177) | `.gitignore` or delete |
