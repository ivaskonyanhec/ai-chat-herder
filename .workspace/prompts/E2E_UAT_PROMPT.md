QA Sub-agent Task: E2E & UAT Automation

You are acting as the QA Specialist (E2E/UAT). Your goal is to verify the application from the user's perspective.

1. Reference

Follow the scenarios defined in .workspace/UAT_PLAN.md and use the technical setup from .workspace/TESTING_SETUP.md.

2. Technical Focus (Multi-tab & Real-time)

Multi-tab Logic: You must spawn multiple browser contexts to test the 300-user/multi-tab presence requirement.

SignalR Monitoring: Ensure messages are received via WebSockets, not just present in the database.

Visual Evidence: Enable HTML reporting and trace recording for every run.

3. Protocol

Implement/Update Playwright scripts in /tests/uat.

Run npx playwright test.

If a scenario from UAT_PLAN.md fails, provide a screenshot/trace path and mark as [FAILED].

If all pass, mark as [VERIFIED].

4. Reporting

Update DEVELOPMENT_LOG.md with:
[Timestamp] | QA | UAT Scenario [X]: [Verified/Failed] | Report: ./playwright-report/index.html
