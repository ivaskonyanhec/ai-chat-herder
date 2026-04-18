# CLAUDE.md — AI Chat Herder

> **Single source of truth:** `AGENT.md` is the authoritative system instruction for all AI agents on this project.
> This file extends it with Claude Code–specific guidance. Read `AGENT.md` first, then this file.

---

## Sync Rules

- `AGENT.md` and `CLAUDE.md` must be kept in sync. Whenever `AGENT.md` is updated, update `CLAUDE.md` to reflect the same changes (or explicitly note Claude-specific divergence here).
- `DESIGN.md` and `designs/tokens.css` must be kept in sync with the Stitch project. Whenever the design system changes, re-export and update both files, then update the Design Reference in `AGENT.md` §19.

---

## Claude Code–Specific Rules

### Transparency Protocol
Before modifying any file, append to `DEVELOPMENT_LOG.md` using the format defined in `AGENT.md` §2.
Task numbering continues sequentially — check the last `T{N}` entry in the log before writing.

### Memory Files
Memory files live at `.claude/projects/…/memory/`. Do not store architecture decisions or code patterns there — those belong in `AGENT.md`. Memory is for session-specific user preferences and project state.

### Skill Invocation
- Use `superpowers:writing-plans` before starting any multi-step implementation.
- Use `superpowers:systematic-debugging` before proposing a fix to any bug.
- Use `superpowers:verification-before-completion` before claiming any task is done.
- **TDD is mandatory.** Every plan task that creates or modifies backend code must write the failing test first. See `AGENT.md` §21 for test project layout, naming conventions, and the 6-step per-task TDD workflow.

### Tool Preferences
- Use `codegraph_search` / `codegraph_callers` / `codegraph_impact` for symbol lookup when `.codegraph/` exists.
- Use `Read` for known paths; `Grep` for specific symbols; `Explore` agent only for open-ended codebase surveys.

---

## Project Identity

See `AGENT.md` §1 — Expert Fullstack Engineer, .NET 10 + Angular 21.

## Tech Stack

See `AGENT.md` §4.

## Architecture

See `AGENT.md` §5–§18 and `ARCHITECTURE.md` for the full specification.

## Coding Standards

See `AGENT.md` §3.

## API Endpoints

See `AGENT.md` §9.

## SignalR Hubs

See `AGENT.md` §10.

## Domain Model

See `AGENT.md` §6.

## Security Model

See `AGENT.md` §7.

## Presence Engine

See `AGENT.md` §11.

## UI Structure

See `AGENT.md` §15.

## Design Reference

See `AGENT.md` §19 and `DESIGN.md`.

- Pixel-accurate HTML mockups: `designs/*.html` (open in browser before implementing any screen)
- CSS custom properties: `designs/tokens.css` (import globally — no hardcoded hex values in components)
- Design rules (No-Line, Glass & Gradient, roundness limits, component specs): `DESIGN.md`

## Unit & Integration Testing (TDD)

See `AGENT.md` §21.

- **Projects:** `tests/ChatHerder.Unit.Tests/` (xUnit + NSubstitute, no I/O) and `tests/ChatHerder.Integration.Tests/` (xUnit + Testcontainers for Postgres + Redis)
- **Run all:** `dotnet test ChatHerder.sln`
- **TDD step sequence per task:** Write failing test → confirm RED → implement → confirm GREEN → refactor → commit (tests + impl together)
- Never write implementation code without a preceding failing test.

## E2E Testing

See `AGENT.md` §20 and `TESTING_SETUP.md`.

- Test runner: `e2e/` directory (Playwright + TypeScript, 14 tests across 5 spec files)
- `PresenceService` **must** expose `(window as any).__presenceHub` when `isDevMode()` — required by the AFK presence test
- All Angular components must declare `data-testid` attributes per the contract in `TESTING_SETUP.md §5`
