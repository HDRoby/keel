---
id: INT-0001
project: PRJ-0001
title: Keel
author: Roberto Basile
created: 2026-11-20
updated: 2026-11-22
status: approved
version: 6
template: standard-intent@3
brainstorm_style: challenger@1
mocks:
  - link: Keel clickable mockup (see docs/mocks/README.md)
---

# Intent: Keel

## Problem

Coding agents now build software in hours, but the steps before the build still run at human speed. Ideas wait for someone to write them up, and requirements and design pass through meetings and handoffs before an engineer can plan. (Source: the AI-native SDLC playbook, stages Plan, Design and Build.)

## Proposed outcome

A web app where anyone with an idea brainstorms with an LLM, then produces a versioned intent, spec and plan with metadata and traceable requirements. It works inside the project's own repository, writes the handoff files for any coding agent (Claude Code, Codex and others) and reads the agent's changes back.

## Requirements

- REQ-001 Brainstorm with an LLM, driven by an intent template chosen at the start
- REQ-002 Generate intent.md with metadata (ID, author, dates, status, version)
- REQ-003 Versioned, editable templates for every document
- REQ-004 Stable requirement IDs traced from intent to spec, plan and tests
- REQ-005 Each stage unlocks only when the previous one is approved
- REQ-006 Hand off a repository scaffold any coding agent can build from
- REQ-012 One project per folder, with its config and libraries in a .keel folder
- REQ-014 Change requests across stages, listed and tracked on a Changes page
- REQ-016 On demand, for any folder, an AI readiness report: a local scan against the Keel standard, then a model review of the gaps and of the AI files the user chooses to share
- REQ-017 Discuss a change with the assistant in a chat grounded in Keel's documents; only the user's explicit agreement creates the change request, and the discussion is kept with it

## Affected users and systems

Proposers (engineers, product managers, anyone with an idea), coding agents, git hosting (GitHub first), LLM providers.

## Constraints

- Web UI, not a VS Code extension.
- Not tied to one model or one coding agent.
- Single user first.
- Stops at plan and scaffold: no code generation inside Keel.

## Open questions

- Public name: "Keel" is already used by other developer tools. Fine as a codename.
- How should a change upstream affect later documents? (Answered by CR-0003: change requests across stages.)

## Version history

- v6: Discuss a change, REQ-017 (CR-0016).
- v5: AI readiness report, REQ-016 (CR-0015).
- v4: change requests across stages (CR-0003).
- v3: one project per folder, in the code repository (CR-0004).
- v2: approved intent for Keel v0.1.
