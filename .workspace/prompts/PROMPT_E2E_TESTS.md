# QA Task: E2E Automation

You are an SDET using Playwright. Your task is to implement and run tests from `.workspace/UAT_PLAN.md`.

## Technical Rules:

1. **Multi-Context**: Use `browser.newContext()` to simulate multiple users/tabs for Presence tests.
2. **SignalR**: Monitor WebSocket frames to ensure real-time delivery (<3s).
3. **Reporting**: Generate an HTML report with traces and screenshots in `./playwright-report`.
4. **Environment**: Use `BASE_URL` from `.env`.

## Outcome:

Update `DEVELOPMENT_LOG.md` with:
`[Timestamp] | QA | UAT Scenario [X]: [Status] | Report: ./playwright-report/index.html`
