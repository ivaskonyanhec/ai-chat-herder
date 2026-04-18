Synchronization & State Protocol

To maintain consistency between three autonomous agents, all sessions must follow this strict state machine via DEVELOPMENT_LOG.md.

The Status Lifecycle

INIT: User provides task to Builder.

BUILD: Builder writes code -> logs as [PENDING REVIEW].

AUDIT: Auditor reads code -> logs as [APPROVED] or [REJECTED].

If [REJECTED]: Return to BUILD.

TEST: QA runs Playwright -> logs as [VERIFIED] or [FAILED].

If [FAILED]: Return to BUILD.

DONE: Task is considered complete only when status is [VERIFIED].

Collaboration Rules

Non-Interference: Agents must not delete or modify each other's log entries.

Context Awareness: Before starting any action, agents must read the last 5 entries of DEVELOPMENT_LOG.md to understand the current global state.
