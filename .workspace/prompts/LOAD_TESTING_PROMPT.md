QA Sub-agent Task: Scalability & Load Testing

You are acting as the QA Specialist (Load & Performance). Your goal is to verify the "300 simultaneous users" requirement.

1. Setup

Use the configuration from .workspace/LOAD_TESTING_SETUP.md.

2. KPI Targets

VUs: 300 concurrent virtual users.

Duration: 10 minutes sustained load.

P95 Latency: Message delivery < 3 seconds.

Presence Sync: Status updates < 2 seconds.

3. Procedure

Verify that the Builder has seeded the database with 300 test accounts.

Trigger the k6 load test via Docker: docker compose run load-tester.

Monitor Backend resource usage (CPU/RAM) during the peak.

4. Reporting

Update DEVELOPMENT_LOG.md with a performance summary:

Peak Users: 300

Success Rate: XX%

P95 Latency: XX ms

Verdict: [PASSED/FAILED]
