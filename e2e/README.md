# AI Chat Herder E2E/UAT

Playwright + TypeScript tests for requirement-driven E2E and UAT coverage.

## Local Run

```bash
docker compose up --build -d
cd e2e
npm install
npx playwright install chromium --with-deps
BASE_URL=http://localhost npm test
```

## Docker Run

```bash
docker compose --profile e2e up --build e2e
```

Reports are written to `./e2e-reports/index.html`.

## Current Coverage Policy

Tests use only `data-testid` selectors for browser interactions. Where the current product implementation lacks a stable UI flow or endpoint, the test is present as `test.skip(...)` with a `BLOCKED` reason and the requirement is marked honestly in `docs/TEST_COVERAGE_MATRIX.md` and `docs/QA_SELF_AUDIT.md`.

The current chat room frontend is largely static. As a result, several messaging, attachment, and moderation UX requirements are blocked until the room UI binds to the REST/SignalR services and file endpoints are mapped.
