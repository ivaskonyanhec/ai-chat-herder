Load Testing Infrastructure (k6 + SignalR)

This document defines the strategy and technical setup for verifying the performance requirement of 300 simultaneous users.

1. Tech Stack

Tool: k6 (Go-based, JS-scripted).

Protocol: WebSockets (SignalR compatibility).

Target: 300 Virtual Users (VUs).

2. Performance Targets (SLAs)

As per Requirements:

Message Latency: 95% of messages must be delivered within < 3 seconds.

Presence Propagation: Status updates must propagate within < 2 seconds.

Stability: Zero socket drops during a 10-minute sustained load of 300 users.

3. Implementation Logic

The load-test.js script must:

Authenticate 300 virtual users.

Maintain active WebSocket/SignalR connections for all 300 users.

Simulate random message broadcasting and heartbeat pings.

Record metrics for message delivery time.

4. Docker Service

load-tester:
image: grafana/k6
volumes: - ./tests/load:/scripts
environment: - TARGET_URL=http://backend:5000/chatHub
entrypoint: ["k6", "run", "/scripts/load-test.js"]

5. Reporting

The QA Agent must update DEVELOPMENT_LOG.md after the load test with:

Peak VUs: 300

p95 Latency: [Value] ms

WebSocket Stability: [Success Rate]%
