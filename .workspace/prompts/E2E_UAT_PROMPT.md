# QA Automation Task — E2E & UAT with Requirement Coverage Audit (Codex CLI)

You are a Senior QA Automation Engineer working directly in this repository.

Your task is to implement a complete **E2E + UAT automated testing setup** using **Playwright + TypeScript**, fully integrated with Docker Compose.

You must also produce a **requirement-to-test coverage matrix** and perform a **self-audit** to prove that the implemented tests cover the requirements. The primary source of truth is `requirements.md`, which defines the application’s functional and non-functional requirements.

---

## 1. Source of Truth (STRICT PRIORITY)

You MUST follow these documents in this exact priority order:

1. **requirements.md** — PRIMARY SOURCE OF TRUTH
   All tests, selectors, fixtures, and validations must be derived from this file first.

2. ARCHITECTURE.md

3. TESTING_SETUP.md

4. UAT_PLAN.md

5. PROMPT_E2E_TESTS.md

6. E2E_UAT_PROMPT.md

7. LOAD_TESTING_SETUP.md

If any conflict exists:

- `requirements.md` always wins.

---

## 2. Goal

Implement all of the following:

1. A full Playwright E2E test suite
2. A UAT layer derived from `requirements.md` and `UAT_PLAN.md`
3. Docker-based execution via `docker compose --profile e2e up`
4. HTML reports, traces, screenshots
5. Required code/config updates for testability
6. A **Requirement Coverage Matrix**
7. A **Self-Audit Report** showing which requirements are:
   - COVERED
   - PARTIALLY COVERED
   - BLOCKED
   - NOT YET COVERED

---

## 3. Deliverables

Create or update:

```text
e2e/
  package.json
  playwright.config.ts
  tsconfig.json
  Dockerfile.e2e
  README.md
  helpers/
    api.helpers.ts
    auth.helpers.ts
    room.helpers.ts
    signalr.helpers.ts
    attachment.helpers.ts
  fixtures/
    test-fixtures.ts
  tests/
    01-auth.spec.ts
    02-chat.spec.ts
    03-presence.spec.ts
    04-attachments.spec.ts
    05-admin.spec.ts
    uat/
      01-onboarding.uat.spec.ts
      02-multitab-afk.uat.spec.ts
      03-realtime-messaging.uat.spec.ts
      04-moderation.uat.spec.ts
      05-file-security.uat.spec.ts
docs/
  TEST_COVERAGE_MATRIX.md
  QA_SELF_AUDIT.md
e2e-reports/
  .gitkeep
```

Also update if needed:

- `docker-compose.yml`
- `.gitignore`
- frontend components to add `data-testid`
- `DEVELOPMENT_LOG.md`

---

## 4. Core Implementation Rules

- Use **Playwright + TypeScript**
- Use `browser.newContext()` for independent users/sessions/tabs
- Use `workers = 1`
- Use `data-testid` selectors only
- Every test must create its own users and rooms
- Validate actual browser-visible behavior, not only API success
- Validate actual SignalR-driven real-time behavior, not mocks
- Do not weaken assertions just because the UI is incomplete
- If testability is missing, add minimal app changes and document them
- Follow `requirements.md` strictly

---

## 5. Required E2E Coverage

Implement at minimum the following technical E2E suites.

### 5.1 Auth

Create `e2e/tests/01-auth.spec.ts`

Cover:

- registration with email + password + unique username
- login
- invalid login
- persistent session after reload
- sign out current browser session
- active session behavior if UI exists
- delete account if the UI/API supports it

Must reflect requirements such as:

- unique email
- unique username
- immutable username
- persistent login across browser close/reopen semantics where testable

### 5.2 Chat

Create `e2e/tests/02-chat.spec.ts`

Cover:

- user A sends room message
- user B receives it
- sender sees own message immediately
- message visible within **< 3 seconds**
- multiline text
- emoji
- reply/reference flow if implemented
- messages remain after reload/history refetch if testable

### 5.3 Presence

Create `e2e/tests/03-presence.spec.ts`

Cover:

- online
- AFK
- offline
- multi-tab behavior
- if one tab is active, user remains online
- AFK only when all tabs inactive
- propagation latency < 2 seconds

For technical determinism, you may expose a test/dev hook if needed, but the implemented logic must still match the 1-minute AFK semantics from requirements.

### 5.4 Attachments

Create `e2e/tests/04-attachments.spec.ts`

Cover:

- upload file
- upload image
- member download success (200)
- non-member download forbidden (403)
- file size limits:
  - image max 3 MB
  - file max 20 MB

- original filename preserved if testable
- optional comment if supported

### 5.5 Moderation

Create `e2e/tests/05-admin.spec.ts`

Cover:

- room owner/admin bans a user
- removing a user is treated as a ban
- banned user removed from room immediately
- banned user cannot rejoin
- banned user loses file access
- owner protections where applicable
- admin role handling where testable

---

## 6. Required UAT Coverage

Implement acceptance-oriented tests in:

```text
e2e/tests/uat/
```

### 6.1 Onboarding & Identity

Create `01-onboarding.uat.spec.ts`

Verify:

- new user can register
- new user can sign in
- username cannot be changed
- account deletion works if exposed

### 6.2 Multi-Tab AFK

Create `02-multitab-afk.uat.spec.ts`

Verify:

- user opens two tabs
- one active tab keeps online state
- AFK appears only when all tabs inactive
- activity restores online state

### 6.3 Real-Time Messaging UX

Create `03-realtime-messaging.uat.spec.ts`

Verify:

- one user sends a message
- another user receives it quickly
- replies/quoted messages behave correctly if implemented

### 6.4 Moderation UX

Create `04-moderation.uat.spec.ts`

Verify:

- admin bans member
- banned user is removed from the room UI
- banned user cannot access the room again

### 6.5 File Security

Create `05-file-security.uat.spec.ts`

Verify:

- authorized participant can download
- unauthorized user cannot download direct attachment URL

---

## 7. Docker Execution Requirements

The suite must support both local and Docker execution.

### Local

```bash
docker compose up --build -d
cd e2e
npm install
npx playwright install chromium --with-deps
BASE_URL=http://localhost npx playwright test
```

### Docker / CI

```bash
docker compose --profile e2e up --build e2e
```

Requirements:

- e2e service waits for backend and frontend healthchecks
- reports are written to `./e2e-reports`
- `BASE_URL` is configurable
- default Docker base URL should target the frontend service

---

## 8. Reporting Requirements

Enable:

- HTML report
- trace on failure
- screenshot on failure
- retain enough artifacts to debug failures

Write reports to:

```text
./e2e-reports/index.html
```

---

## 9. DEVELOPMENT_LOG.md Updates

After the run, update `DEVELOPMENT_LOG.md` with entries like:

```text
[Timestamp] | QA | E2E Auth: PASSED | Report: ./e2e-reports/index.html
[Timestamp] | QA | E2E Presence: FAILED | Trace: ./e2e-reports/... | Screenshot: ./e2e-reports/...
[Timestamp] | QA | UAT Scenario 1: VERIFIED | Report: ./e2e-reports/index.html
```

Use:

- `PASSED` / `FAILED` / `BLOCKED` for E2E
- `VERIFIED` / `FAILED` / `BLOCKED` for UAT

---

## 10. Requirement Coverage Matrix (MANDATORY)

Create:

```text
docs/TEST_COVERAGE_MATRIX.md
```

This file must map requirements from `requirements.md` to automated tests.

Use a table with this format:

```md
| Requirement ID | Requirement Summary | Test Type | Test File | Test Name / Scenario | Status | Notes |
| -------------- | ------------------- | --------- | --------- | -------------------- | ------ | ----- |
```

You must create requirement IDs if the source file does not already provide machine-friendly IDs.

Use a consistent scheme such as:

- FR-2.1.1-1
- FR-2.1.2-1
- NFR-3.2-1
- UI-4.2-1

Examples:

- `FR-2.1.1-1` = registration with email/password/username
- `FR-2.2.2-1` = AFK after 1 minute inactivity
- `NFR-3.2-1` = message delivery < 3 seconds
- `FR-2.6.4-1` = attachment download access control

Every major requirement in `requirements.md` must be classified as one of:

- `COVERED`
- `PARTIALLY COVERED`
- `BLOCKED`
- `NOT COVERED`

Do not skip requirements silently.

---

## 11. Self-Audit Report (MANDATORY)

Create:

```text
docs/QA_SELF_AUDIT.md
```

This file must contain:

### 11.1 Summary

- total requirements reviewed
- total covered
- total partially covered
- total blocked
- total not covered

### 11.2 Covered Requirements

List all requirements that are fully covered by automated tests.

### 11.3 Partial Coverage

List requirements that are only partly covered and explain exactly what is missing.

### 11.4 Blocked Requirements

List requirements that could not be automated because of missing:

- UI flows
- selectors
- API endpoints
- stable hooks
- testability support
- incomplete product implementation

For every blocked requirement, specify:

- requirement ID
- reason
- what code/product change would unblock it

### 11.5 Not Covered

List any requirements intentionally left uncovered and explain why.

### 11.6 Risk Review

Call out important uncovered risks, especially around:

- multi-tab presence
- session management
- access control
- moderation
- attachment security
- persistence/history
- non-functional timing requirements

---

## 12. Self-Audit Execution Rule

Before finishing, you MUST compare implemented tests against `requirements.md` line by line and verify that:

1. every meaningful requirement has an ID
2. every requirement appears in `TEST_COVERAGE_MATRIX.md`
3. every requirement has a status
4. every status is justified
5. any missing coverage is explicitly documented

Do not claim full coverage unless the matrix proves it.

If the product does not yet support a requirement, mark it honestly as `BLOCKED` or `NOT COVERED`.

---

## 13. Constraints

- Do NOT use Playwright for load testing
- Do NOT simulate 300 browser users in Playwright
- Load testing belongs to the k6 layer
- Do NOT mock backend behavior in place of real validation
- Do NOT omit requirements that are hard to automate
- Do NOT mark something as covered unless an actual test exists

---

## 14. Definition of Done

The task is complete only when all of the following are true:

1. `docker compose up --build -d` starts the stack
2. `docker compose --profile e2e up --build e2e` runs the test suite
3. E2E tests are implemented
4. UAT tests are implemented
5. Reports are generated
6. `DEVELOPMENT_LOG.md` is updated
7. `docs/TEST_COVERAGE_MATRIX.md` exists and is complete
8. `docs/QA_SELF_AUDIT.md` exists and is honest
9. missing testability gaps are documented
10. requirement coverage is traceable back to `requirements.md`

---

## 15. Final Output Required from You

After implementation, provide:

1. Summary of changes
2. File tree of added/updated files
3. Exact commands to run locally
4. Exact Docker command to run the suite
5. E2E results
6. UAT results
7. Path to generated report
8. Path to coverage matrix
9. Path to self-audit report
10. List of blocked or missing requirements
11. Recommended next steps to improve testability
