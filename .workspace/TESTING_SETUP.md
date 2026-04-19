# TESTING_SETUP.md — Quality Assurance & E2E Testing

## Overview

This document describes the automated end-to-end testing strategy for AI Chat Herder. Tests are written in **Playwright + TypeScript** and run against the full Docker Compose stack (backend, frontend, PostgreSQL, Redis, RabbitMQ). All critical real-time requirements — message delivery SLA, presence propagation, file access control, and ban enforcement — are covered by automated assertions.

---

## 1. Testing Methodology

### Why Playwright

Playwright is chosen over Cypress or Selenium for three architectural reasons specific to this project:

| Requirement | How Playwright addresses it |
|-------------|----------------------------|
| **Multi-tab presence tests** | `browser.newContext()` creates fully isolated sessions (separate cookies, localStorage, WebSocket connections) — exact equivalent of two separate browser instances |
| **WebSocket / SignalR monitoring** | `page.waitForResponse()` and `page.evaluate()` can observe and drive the SignalR protocol layer from inside the browser runtime |
| **Latency benchmarking** | `Date.now()` timestamps around `expect().toBeVisible()` give wall-clock delivery measurements for the < 3s message SLA |

### Test isolation

- Every test creates its own users via `POST /api/auth/register` (no pre-seeded fixtures).
- Every test creates its own rooms — tests never share state.
- `workers: 1` in `playwright.config.ts` prevents parallel tests from racing on the shared DB and Redis instance.

---

## 2. Critical Test Scenarios

### 2.1 Multi-Tab Presence & AFK Logic — Proof of Concept for the Presence Engine

This is the hardest scenario to reproduce manually and the most important to automate.

**Test file:** `e2e/tests/03-presence.spec.ts`

| Step | What the test does | What it proves |
|------|--------------------|----------------|
| 1 | Open User A in `ctxA`, User B in `ctxB` | Two isolated browser sessions, each with a live SignalR connection |
| 2 | Assert User A's members panel shows `data-status="online"` for User B | `presence:online:{roomId}` Redis Sorted Set is correct; `UserStatusChanged` event routed to User A |
| 3 | `page.evaluate(() => window.__presenceHub.invoke('SetAfk'))` on User B's page | Direct hub call bypasses the 60s inactivity timer for a deterministic, fast test |
| 4 | Assert `data-status="afk"` within **2 seconds** | Server updates `afk_tabs:{userId}` Redis Set, all-tabs-AFK check passes, `UserStatusChanged(afk)` broadcast received by User A within the < 2s SLA |

> **Implementation dependency:** `PresenceService` must expose the connection when running in dev mode:
> ```typescript
> if (isDevMode()) { (window as any).__presenceHub = this.connection; }
> ```

**All four presence transitions tested:**

1. Connection → `online`
2. `SetAfk()` → `afk` (≤ 2s)
3. `SetActive()` → back to `online` (≤ 2s)
4. Page close → `offline` (≤ 3s via `OnDisconnectedAsync`)

---

### 2.2 Authentication: Registration → Login → Persistent Session

**Test file:** `e2e/tests/01-auth.spec.ts`

- Full UI registration form → auto-login → `main-chat` visible
- Login with valid credentials → `main-chat` visible
- `page.reload()` → Angular silently refreshes the access token using the stored refresh token → stays authenticated
- Invalid credentials → `login-error` element visible, no redirect

---

### 2.3 Real-time Chat Delivery (< 3s SLA)

**Test file:** `e2e/tests/02-chat.spec.ts`

- User A and User B open the same room in separate contexts.
- User A sends a message. `Date.now()` is captured before and after `expect(msgLocator).toBeVisible()`.
- The assertion timeout is **3 000 ms** — the test fails automatically if delivery takes longer.
- Additional cases: sender sees own message immediately (loopback), input clears after send.

---

### 2.4 File Upload & Access Control

**Test file:** `e2e/tests/04-attachments.spec.ts`

- Generates a **5 MB** binary temp file using `Buffer.alloc(5 * 1024 * 1024, 0xab)`.
- User A uploads via `setInputFiles()` + submit button.
- User B (a member) sees the attachment message within 15s and downloads it → `response.status() === 200`.
- Non-member (User B not added to a private room) attempts download via the API → must receive `403`.

This directly tests `GET /api/files/{attachmentId}` membership validation via PostgreSQL (not Redis), which is a critical security invariant in AGENT.md §3.4.

---

### 2.5 Admin Moderation: Ban Enforcement

**Test file:** `e2e/tests/05-admin.spec.ts`

- User B is in the room with an open page (`chat-area` visible).
- User A (owner) opens the admin modal, selects User B, clicks ban + confirm.
- The backend calls `ForceLeaveRoom` on User B's SignalR connection.
- The Angular client receives `RemovedFromRoom`, navigates away.
- **Assertion:** `chat-area` is no longer visible for User B within **3 seconds**.
- Additional: banned user gets `403` on re-join attempt; owner gets `403` from admin ban attempt.

---

## 3. Infrastructure & Reproducibility

### Running Tests Locally (against a running stack)

```bash
# 1. Start the full stack
docker compose up --build -d

# 2. Wait for healthy state
docker compose ps    # all services should show (healthy)

# 3. Install test dependencies (first time only)
cd e2e && npm install && npx playwright install chromium --with-deps

# 4. Run all tests
BASE_URL=http://localhost npx playwright test

# 5. Open the HTML report
npx playwright show-report playwright-report
```

Expected output: 14 tests across 5 spec files, all green.

---

### Running Tests in Docker (CI / headless)

```bash
# Run the full stack + E2E runner in one command
docker compose --profile e2e up --build e2e

# Watch progress
docker compose logs -f e2e

# After completion, view report in browser
open e2e-reports/index.html
```

The `e2e` service declares `depends_on` with `condition: service_healthy` for both `frontend` and `backend`. It will not start until both services pass their healthchecks — no flaky race conditions from premature test execution.

---

### Orchestration Flow

```
docker compose --profile e2e up e2e
         │
         ▼
postgres + redis + rabbitmq  ──(healthy)──▶  backend  ──(healthy)──▶  frontend
                                                                           │
                                                                    (healthy)
                                                                           │
                                                                           ▼
                                                                     e2e runner
                                                                    (Playwright)
                                                                           │
                                                               ┌───────────┴────────────┐
                                                               │   ./e2e-reports/       │
                                                               │   index.html           │
                                                               │   results.json         │
                                                               └────────────────────────┘
```

---

### Report Volume

Reports are written to `./e2e-reports/` on the host (Docker bind mount). The directory is tracked in git with a `.gitkeep` placeholder. The report files themselves are excluded via `.gitignore`.

After a run:

| File | Contents |
|------|----------|
| `e2e-reports/index.html` | Interactive HTML report — pass/fail, screenshots, traces, video |
| `e2e-reports/results.json` | Machine-readable test results for CI integration |
| `e2e-reports/trace/` | Playwright traces for failed tests (open with `npx playwright show-trace`) |

---

### Environment Variables

All URLs and credentials come from the `.env` file (copied from `.env.template`). The E2E runner reads:

| Variable | Default in `.env.template` | Description |
|----------|---------------------------|-------------|
| `BASE_URL` | `http://frontend` | URL the Playwright runner navigates to. Use `http://localhost` for local runs. |
| `CI` | _(set by e2e service)_ | Enables 1 retry on flaky failures |

Test user credentials are generated dynamically per test via `POST /api/auth/register` — no static test credentials in `.env`.

---

## 4. File Map

```
e2e/
  playwright.config.ts         Base config: baseURL, workers=1, reporters
  package.json                 Playwright 1.49 + @microsoft/signalr + TypeScript
  tsconfig.json                TypeScript config for the e2e directory
  helpers/
    api.helpers.ts             REST helper: register, createRoom, addMember, banMember
  fixtures/
    test-fixtures.ts           Playwright fixture extensions: userA/B contexts + pages
  tests/
    01-auth.spec.ts            Auth: register, login, session persistence, invalid creds
    02-chat.spec.ts            Chat: delivery < 3s, self-message, input clear
    03-presence.spec.ts        Presence: online/AFK/offline propagation with 2s SLA
    04-attachments.spec.ts     Files: 5 MB upload + download 200, non-member 403
    05-admin.spec.ts           Admin: ban enforcement, owner protection, 403 rejoin
Dockerfile.e2e                 Playwright 1.49 + Chromium headless container
e2e-reports/                   Report output (bind-mounted in Docker; excluded from git)
```

---

## 5. `data-testid` Contract

Angular components must add these attributes for the selectors to resolve:

| Attribute | Component | Used in |
|-----------|-----------|---------|
| `data-testid="go-to-register"` | AuthPage | 01-auth |
| `data-testid="register-username/email/password/submit"` | RegisterForm | 01-auth |
| `data-testid="login-email/password/submit/error"` | LoginForm | 01-auth |
| `data-testid="main-chat"` | ChatShell | 01-auth, 02-chat |
| `data-testid="chat-area"` | MessageList | 02-chat, 03-presence, 05-admin |
| `data-testid="message-input"` | MessageComposer | 02-chat |
| `data-testid="message-text"` | MessageBubble | 02-chat |
| `data-testid="member-status-{userId}"` | MemberItem | 03-presence |
| `data-testid="member-role-{userId}"` | MemberItem | 05-admin |
| `data-testid="file-input"` | AttachmentButton | 04-attachments |
| `data-testid="upload-submit"` | AttachmentButton | 04-attachments |
| `data-testid="attachment-download-link"` | MessageBubble | 04-attachments |
| `data-testid="admin-modal-btn"` | RoomHeader | 05-admin |
| `data-testid="tab-members"` | AdminModal | 05-admin |
| `data-testid="ban-member-{userId}"` | AdminMembersTab | 05-admin |
| `data-testid="ban-confirm"` | AdminModal | 05-admin |
| `data-testid="access-denied"` | RoomView | 05-admin (optional) |
| `data-testid="dm-messages"` | DirectMessagesComponent | 06-dm-flow |
| `data-testid="dialog-item-{id}"` | DirectMessagesComponent | 06-dm-flow (dialog list button per conversation) |
| `data-testid="dm-message-input"` | DirectMessagesComponent | 06-dm-flow (DM message text input) |
| `data-testid="dm-send-btn"` | DirectMessagesComponent | 06-dm-flow (send message button in DM composer) |

---

## 6. Adding New Tests

1. Create `e2e/tests/NN-feature.spec.ts`.
2. Import from `../fixtures/test-fixtures` (not directly from `@playwright/test`).
3. Use `api.register()` inside the `userA` / `userB` fixtures — do not hardcode test credentials.
4. Add a `data-testid` entry to the table above and add the attribute to the Angular component.
5. Append a log entry to `DEVELOPMENT_LOG.md` before committing.

---

## 7. Audit Trail

Every test suite creation and modification is logged in `DEVELOPMENT_LOG.md`. Visual reports (`index.html`, `results.json`) are preserved in `e2e-reports/` and are available on the shared Docker volume for post-run review by any team member or evaluator.

The `e2e` Docker service runs headlessly in a reproducible environment — running `docker compose --profile e2e up e2e` on any machine with the `.env` filled in will produce the same test results.
