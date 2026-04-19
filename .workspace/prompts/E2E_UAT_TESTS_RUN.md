# E2E/UAT Test Run Prompt

You are an AI coding agent working in the `ai-chat-herder` repository.

## Objective

Run the complete E2E/UAT Playwright suite with a single command, store reports in the standardized report layout, then use those reports to identify failures and apply focused fixes.

## Required Context

Before running or fixing tests, read:

1. `AGENT.md`
2. `requirements.md`
3. `docs/TEST_COVERAGE_MATRIX.md`
4. `docs/QA_SELF_AUDIT.md`
5. `e2e/README.md`

Follow the `DEVELOPMENT_LOG.md` transparency protocol before editing any file.

## Single Command

From the repository root, run:

```bash
npm --prefix e2e run test:all
```

Optional target URL:

```bash
BASE_URL=http://localhost npm --prefix e2e run test:all
```

Podman profile alternative for local runs:

```bash
podman compose --profile e2e up --build e2e
```

GitHub Actions uses Docker Compose on hosted runners, but local container commands in this repository assume Podman.

The command runs:

1. E2E TypeScript typecheck.
2. Every Playwright test under `e2e/tests`, including UAT tests under `e2e/tests/uat`.
3. HTML, JSON, JUnit, artifact, manifest, and markdown summary report generation.

## Report Layout

Every run writes to:

```text
e2e-reports/
  latest/
    summary.md
    manifest.json
    results.json
    junit.xml
    html/index.html
    artifacts/
  runs/
    e2e-uat-YYYYMMDDTHHMMSSZ/
      summary.md
      manifest.json
      results.json
      junit.xml
      html/index.html
      artifacts/
```

Use `e2e-reports/latest/summary.md` as the first file for triage.
Use `e2e-reports/latest/manifest.json` for machine-readable handoff metadata.
Use `e2e-reports/latest/results.json` and `e2e-reports/latest/junit.xml` for exact failure details.
Use `e2e-reports/latest/html/index.html` for the browser report.
Use `e2e-reports/latest/artifacts/` for retained traces, videos, and screenshots.

## Fix Workflow

1. If the runner fails during typecheck, fix TypeScript errors before looking at Playwright failures.
2. If Playwright tests fail, start from `summary.md`, then inspect `results.json` and retained artifacts.
3. Do not weaken or delete assertions to make a test pass.
4. If a test fails because product functionality is missing, keep or convert it to an explicit `test.skip(...)` with a `BLOCKED` reason, then update `docs/TEST_COVERAGE_MATRIX.md` and `docs/QA_SELF_AUDIT.md`.
5. If a test fails because the test is stale and implementation is correct, update the test to the current contract.
6. If a production defect is found and the user allowed implementation changes, fix it with the smallest scoped change and add/adjust tests.
7. Append a `DEVELOPMENT_LOG.md` entry for any edits.

## Completion Criteria

Report:

- The exact command run.
- Whether typecheck passed.
- Total tests, passed tests, failed tests, skipped tests, and flaky tests from `summary.md` or `manifest.json`.
- The latest report paths.
- Any product gaps that remain blocked.
- Any files changed.
