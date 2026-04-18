# Load Test Coverage Matrix

| Requirement ID | Requirement | Metric | Target | Result | Status |
| -------------- | ----------- | ------ | ------ | ------ | ------ |
| NFR-3.1-1 | Support 300 simultaneous users | Peak VUs | 300 | Not run | BLOCKED |
| NFR-3.2-1 | Message delivery latency | `message_delivery_latency_ms p95` | `< 3000 ms` | Not run | BLOCKED |
| NFR-3.2-2 | Presence propagation latency | `presence_propagation_latency_ms p95` | `< 2000 ms` | Not run | BLOCKED |
| NFR-3.2-3 | Sustained usability under load | 10-minute steady state | 10 minutes at 300 VUs | Not run | BLOCKED |
| NFR-3.5-2 | Multi-tab/session real-time stability | WebSocket drops | `0` | Not run | BLOCKED |
| NFR-3.6-1 | Consistency under load | Message/presence success rates | `> 95%` | Not run | BLOCKED |
| LT-SETUP-1 | Authenticate every VU | Register/login in setup | 300 users | Implemented, not run | READY |
| LT-SETUP-2 | Maintain active WebSocket connections | Presence + chat WebSockets | 300 users connected | Implemented, not run | READY |
| LT-SETUP-3 | Simulate message broadcasting | `SendMessage` invocations | Random interval sends | Implemented, not run | READY |
| LT-SETUP-4 | Simulate heartbeat/presence | `Heartbeat`, `SetAfk`, `SetActive` | Continuous presence traffic | Implemented, not run | READY |
| LT-SETUP-5 | Docker execution | `docker compose run load-tester` | k6 runner starts | Implemented, not run | READY |

## Notes

- `READY` means the load script contains the required behavior, but no runtime result exists yet.
- `BLOCKED` means the requirement cannot be marked passed until the Docker stack is available and the load test produces real k6 metrics.
- No metric is marked passed without a real run.
