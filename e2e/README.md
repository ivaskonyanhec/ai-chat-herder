# AI Chat Herder E2E/UAT

Playwright + TypeScript tests for requirement-driven E2E and UAT coverage.

## Local Run

```bash
podman compose up --build -d
cd e2e
npm install
npx playwright install chromium --with-deps
BASE_URL=http://localhost npm run test:all
```

From the repository root, the same full suite can be run with one command:

```bash
BASE_URL=http://localhost npm --prefix e2e run test:all
```

## Podman Run

```bash
podman compose --profile e2e up --build e2e
```

GitHub Actions uses Docker Compose on the hosted runner, but local container commands assume Podman.

## Reports

Reports are written under `../e2e-reports`:

- `latest/summary.md` — first file to read for triage.
- `latest/manifest.json` — machine-readable run metadata for agents.
- `latest/results.json` — Playwright JSON output.
- `latest/junit.xml` — CI/JUnit output.
- `latest/html/index.html` — Playwright HTML report.
- `latest/artifacts/` — retained traces, videos, and screenshots.
- `runs/e2e-uat-YYYYMMDDTHHMMSSZ/` — immutable archive for each run.

Open the latest HTML report with:

```bash
npm run report
```

## Current Coverage Policy

Tests use only `data-testid` selectors for browser interactions. Where the current product implementation lacks a stable UI flow or endpoint, the test is present as `test.skip(...)` with a `BLOCKED` reason and the requirement is marked honestly in `docs/TEST_COVERAGE_MATRIX.md` and `docs/QA_SELF_AUDIT.md`.

The current chat room frontend is largely static. As a result, several messaging, attachment, and moderation UX requirements are blocked until the room UI binds to the REST/SignalR services and file endpoints are mapped.
