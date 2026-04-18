# CLAUDE.md — AI Chat Herder

> **Single source of truth:** `AGENT.md` is the authoritative system instruction for all AI agents on this project.
> This file extends it with Claude Code–specific guidance. Read `AGENT.md` first, then this file.

---

## Sync Rule

`AGENT.md` and `CLAUDE.md` must be kept in sync. Whenever `AGENT.md` is updated, update `CLAUDE.md` to reflect the same changes (or explicitly note any Claude-specific divergence here).

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
