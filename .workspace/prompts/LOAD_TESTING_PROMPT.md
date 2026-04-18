# QA Automation Task — Load & Performance Testing (Codex CLI)

You are a Senior QA Performance Engineer working directly in this repository.

Your task is to implement a complete **load and performance testing setup** using **k6 + SignalR (WebSocket)**, fully integrated with Docker Compose.

You must validate system scalability and performance requirements defined in `requirements.md`, using the exact technical approach described in `LOAD_TESTING_SETUP.md`.

---

## 1. Source of Truth (STRICT PRIORITY)

You MUST follow these documents in this exact order:

1. **requirements.md (PRIMARY)**
   Defines all performance, scale, and behavior requirements

2. **LOAD_TESTING_SETUP.md (MANDATORY IMPLEMENTATION SPEC)**
   Defines exact k6 + SignalR setup, Docker service, and testing logic

3. ARCHITECTURE.md

4. TESTING_SETUP.md

If any conflict exists:

- requirements.md ALWAYS wins

---

## 2. Goal

Implement:

1. k6-based load testing suite
2. SignalR/WebSocket simulation of real chat users
3. Docker-based execution (`docker compose run load-tester`)
4. Metrics collection (latency, success rate, stability)
5. Performance report + DEVELOPMENT_LOG.md update
6. Load testing coverage matrix
7. Self-audit report

---

## 3. Requirements to Validate

From `requirements.md`:

### Scale

- System must support **300 simultaneous users**

### Performance

- Message delivery latency **< 3 seconds (p95)**
- Presence propagation **< 2 seconds**

### Stability

- System must remain stable under sustained load
- No major WebSocket drops
- No degradation during 10-minute load

From `LOAD_TESTING_SETUP.md`:

- 300 VUs
- 10-minute sustained load
- SignalR/WebSocket communication
- Real-time message + heartbeat simulation

---

## 4. Deliverables

Create or update:

```text id="rkq6lt"
tests/load/
  load-test.js
  signalr-client.js
  scenarios/
    messaging.scenario.js
    presence.scenario.js
  helpers/
    auth.helper.js
    websocket.helper.js
    metrics.helper.js

docs/
  LOAD_TEST_RESULTS.md
  LOAD_TEST_COVERAGE_MATRIX.md
  LOAD_TEST_SELF_AUDIT.md
```

Update if needed:

- docker-compose.yml → add `load-tester` service EXACTLY as defined in LOAD_TESTING_SETUP.md
- environment variables
- test user seeding scripts

---

## 5. STRICT Implementation Requirements (from LOAD_TESTING_SETUP.md)

You MUST implement the following behavior:

### Each Virtual User (VU) must:

1. Authenticate
2. Open WebSocket/SignalR connection
3. Stay connected during entire test
4. Send messages randomly
5. Receive messages
6. Send heartbeat/presence updates

### Test script must:

- Maintain **300 active WebSocket connections**
- Simulate **message broadcasting**
- Measure **delivery time**
- Simulate **presence updates**
- Run continuously for 10 minutes

---

## 6. Load Profile

You MUST implement:

- 300 concurrent VUs
- ramp-up (gradual)
- 10-minute steady state
- optional ramp-down

Example:

- 0 → 300 users in 60 seconds
- 300 users for 10 minutes

---

## 7. Metrics (MANDATORY)

You MUST measure:

### Message Latency

- send → receive
- avg, p95, p99

### Presence Latency

- status change → observed by others

### Success Rate

- successful message deliveries %

### WebSocket Stability

- connection drops
- reconnect attempts

### System Load (if accessible)

- CPU
- memory

---

## 8. Docker Execution (STRICT)

Must match LOAD_TESTING_SETUP.md:

```yaml id="u7t0xy"
load-tester:
  image: grafana/k6
  volumes:
    - ./tests/load:/scripts
  environment:
    - TARGET_URL=http://backend:5000/chatHub
  entrypoint: ["k6", "run", "/scripts/load-test.js"]
```

Run command:

```bash id="e9g4pq"
docker compose run load-tester
```

Do NOT change:

- image
- script path
- protocol approach

---

## 9. Reporting

Create:

```text id="a9pjk2"
docs/LOAD_TEST_RESULTS.md
```

Include:

- Peak users
- Test duration
- Avg latency
- P95 latency
- P99 latency
- Success rate
- WebSocket stability
- Observed bottlenecks

---

## 10. DEVELOPMENT_LOG.md

Append:

```text id="w5lg3d"
[Timestamp] | QA | Load Test | Peak Users: 300 | P95: XXX ms | Success Rate: XX% | Verdict: PASSED/FAILED
```

---

## 11. Coverage Matrix (MANDATORY)

Create:

```text id="kz3h4b"
docs/LOAD_TEST_COVERAGE_MATRIX.md
```

Example:

```md id="6t1pmw"
| Requirement ID | Requirement      | Metric | Target  | Result | Status  |
| -------------- | ---------------- | ------ | ------- | ------ | ------- |
| NFR-3.1        | 300 users        | VUs    | 300     | 300    | COVERED |
| NFR-3.2        | Message latency  | p95    | <3000ms | 1800ms | PASSED  |
| NFR-3.2        | Presence latency | p95    | <2000ms | 1200ms | PASSED  |
```

---

## 12. Self-Audit (MANDATORY)

Create:

```text id="b6vd2c"
docs/LOAD_TEST_SELF_AUDIT.md
```

Include:

### Summary

- total requirements checked
- passed / failed / blocked

### Passed

- validated requirements

### Failed

- unmet performance targets

### Blocked

- missing infra/data

### Risks

- scaling bottlenecks
- DB / Redis / SignalR pressure
- memory leaks
- connection limits

---

## 13. Critical Constraints

- DO NOT use Playwright
- DO NOT simulate browser UI
- DO NOT use HTTP polling instead of WebSockets
- DO NOT fake metrics
- DO NOT skip requirements
- DO NOT modify the load test model defined in LOAD_TESTING_SETUP.md

---

## 14. Definition of Done

- load test runs via Docker
- 300 VUs simulated
- WebSocket connections stable
- metrics collected
- reports generated
- DEVELOPMENT_LOG.md updated
- coverage matrix created
- self-audit completed
- requirements.md validated with real data

---

## 15. Final Output

After execution, provide:

1. Summary of implementation
2. File tree
3. Command to run test
4. Results (latency, success rate, stability)
5. Report path
6. Coverage matrix path
7. Self-audit path
8. Identified bottlenecks
9. Recommendations for scaling
