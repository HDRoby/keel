---
id: INT-0001
project: PRJ-0001
title: Keel
author: Roberto Basile
created: 2026-11-20
updated: 2026-11-20
status: approved
version: 2
template: standard-intent@3
brainstorm_style: challenger@1
mocks:
  - link: Keel clickable mockup (see docs/mocks/README.md)
---

# Intent: Keel

## Problem

Coding agents now build software in hours, but the steps before the build still run at human speed. Ideas wait for someone to write them up, and requirements and design pass through meetings and handoffs before an engineer can plan. (Source: the AI-native SDLC playbook, stages Plan, Design and Build.)

## Proposed outcome

A web app where anyone with an idea brainstorms with an LLM, then produces a versioned intent, spec and plan with metadata and traceable requirements. It hands a scaffolded repository to any coding agent (Claude Code, Codex and others) and reads the agent's changes back.

## Requirements

- REQ-001 Brainstorm with an LLM, driven by an intent template chosen at the start
- REQ-002 Generate intent.md with metadata (ID, author, dates, status, version)
- REQ-003 Versioned, editable templates for every document
- REQ-004 Stable requirement IDs traced from intent to spec, plan and tests
- REQ-005 Each stage unlocks only when the previous one is approved
- REQ-006 Hand off a repository scaffold any coding agent can build from

## Affected users and systems

Proposers (engineers, product managers, anyone with an idea), coding agents, git hosting (GitHub first), LLM providers.

## Constraints

- Web UI, not a VS Code extension.
- Not tied to one model or one coding agent.
- Single user first.
- Stops at plan and scaffold: no code generation inside Keel.

## Open questions

- Public name: "Keel" is already used by other developer tools. Fine as a codename.
- How should a change upstream affect later documents? (Answered later by CR-0003, which is in Next on the roadmap.)
