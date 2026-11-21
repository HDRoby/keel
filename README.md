# Keel

Keel takes an idea from a brainstorm to an approved intent, spec and plan, then hands a ready-to-build repository to any coding agent (Claude Code, Codex and others) and reads the agent's changes back.

This repository is the **handoff package for building Keel itself**. It was produced with the Keel process: the documents in `docs/` were brainstormed, specified and planned before any code exists.

## Start here (for the coding agent)

1. Read `AGENTS.md` (or `CLAUDE.md`, which points to it).
2. Read `docs/intent.md`, `docs/spec.md`, `docs/plan.md` and `docs/roadmap.md`, in that order.
3. Pick the next task in `tasks/` (they are ordered). Make its scenarios in `features/` pass.

## What v0.1 is

- A **local web app**: one command starts it and opens it in the browser.
- **Single user.** Your API keys and repositories stay on your machine.
- **TypeScript full stack**: Next.js (React) UI and API routes in one app.
- **Storage**: markdown documents in a git repository per project (source of truth) plus a local SQLite file as an index and settings store.
- **Model providers**: Anthropic, OpenAI, Azure OpenAI and local models through an OpenAI-compatible endpoint (Ollama).

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Run locally | `npm run dev` (then open http://localhost:3000) |
| Unit tests | `npm test` |
| Acceptance scenarios | `npm run test:bdd` |
| Lint and types | `npm run lint` and `npm run typecheck` |
| Everything CI runs | `npm run verify` |

## Layout

```
docs/          intent, spec, plan, roadmap, decisions, traceability, mock references
tasks/         one file per plan task (T1 to T9)
features/      Gherkin acceptance scenarios, tagged with requirement IDs; steps/ has failing stubs
seed/          templates, brainstorm styles, agent kit and standards Keel ships with
src/           application skeleton
.claude/       subagents and skills for Claude Code (other agents read AGENTS.md)
```

## Status

Every acceptance scenario fails on purpose. The work is done when `npm run verify` passes and every scenario is green.
