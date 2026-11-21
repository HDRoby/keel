---
id: PLN-0001
project: PRJ-0001
title: Keel
author: Roberto Basile
created: 2026-11-20
updated: 2026-11-20
status: approved
version: 6
template: implementation-plan@2
from_spec: SPC-0001@4
---

# Plan: Keel v0.1

## Order of work

Each task has its own file in `tasks/` with details, files that change and the scenarios that prove it.

| Task | Title | Requirements | Scenarios |
| --- | --- | --- | --- |
| T1 | Document store: markdown with YAML front matter in git | REQ-002, REQ-003 | intent-document |
| T2 | Template engine and template library | REQ-003 | templates |
| T3 | Model provider layer | REQ-009 | providers |
| T4 | Brainstorm service: template-driven questions and styles | REQ-001, REQ-011 | brainstorm, brainstorm-styles |
| T5 | Requirement IDs and traceability index | REQ-004 | traceability |
| T6 | Stage gates, approvals, and spec and plan generation | REQ-005 | stage-gating |
| T7 | Version diff, impact view and mock references | REQ-008, REQ-010 | versions, mock-references |
| T8a | Scaffold generator (zip) | REQ-006 | handoff |
| T8b | GitHub push | REQ-006 | handoff |
| T9 | Read-back from the repository | REQ-007 | read-back |

## Version history

- v6: UI pass between T7 and T8a (owner request): app shell, stage bar, Projects, Start, Explore, Intent, Spec and Plan follow the layouts in docs/mocks/, in the neutral design the mocks README asks for (system font, one accent colour). Documents are rendered from markdown.
- v5: T6 also generates spec.md and plan.md (with task files) from their templates; spec and plan authoring was missing from the plan (owner decision). Approvals change the status without a new version. From spec v4.
- v4: split T8 into T8a (scaffold, testable without GitHub) and T8b (push).
- v3: added T9 after spec v3 replaced the one-way handoff with read-back (REQ-007).
- v2: provider layer (T3) before brainstorm (T4), which depends on it.
- v1: generated from spec v2.

## Risks

- **LLM output is not deterministic.** Scenarios must not depend on exact model wording. Use a fake provider in tests (see Test strategy).
- **Secrets.** API keys and GitHub tokens must never reach git, documents or logs (Security baseline v2). Add a test that scans generated packages for key patterns.
- **Read-back noise.** Polling must ignore Keel's own commits and only surface agent changes to `docs/` and `tasks/`.
- **Scope creep.** The roadmap's Next and Later items stay out of v0.1.

## Test strategy

- **Unit tests (Vitest):** every public function, next to its module.
- **Acceptance scenarios (Playwright + playwright-bdd):** `features/*.feature`, run against the dev server with a temporary workspace folder.
- **Fake provider:** `KEEL_PROVIDER=fake` returns scripted replies so brainstorm scenarios are deterministic.
- **Fake GitHub:** a local bare git repository stands in for GitHub in push and read-back scenarios.
- **CI:** `.github/workflows/ci.yml` runs `npm run verify` on every push.
