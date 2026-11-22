---
id: SPC-0001
project: PRJ-0001
title: Keel
author: Roberto Basile
created: 2026-11-20
updated: 2026-11-22
status: approved
version: 14
template: requirements-and-design-spec@2
from_intent: INT-0001@4
standards:
  - security-baseline@2
  - typescript-conventions@3
  - bdd-style@1
  - small-steps@1
  - plain-markdown@1
decision: go (docs/decisions/0001-go.md)
---

# Spec: Keel v0.1

## Requirements

| ID | Requirement | Source |
| --- | --- | --- |
| REQ-001 | Template-driven brainstorm. Explore shows the intent template's sections for the user to fill in. An LLM reviews all sections whenever the user leaves a section, pauses, or replies to a comment, and writes a comment on each section: challenges, cross-references between sections, suggestions or questions. It only fills empty sections as suggestions and offers rewrites the user applies; it never changes the user's text on its own. Requirements is one of the sections, with one row per requirement. | Intent |
| REQ-002 | `intent.md` with metadata: ID, project, author, created, updated, status, version, template, brainstorm style. intent.md is assembled from the Explore sections with no model call. Requirement IDs are given when the intent is drafted and never change. Once the intent is approved, edits in Explore are saved as a change request. | Intent |
| REQ-003 | Versioned, editable templates for intent, spec, plan, roadmap, decision records, agent instructions and the agent kit. A template used by any project cannot be removed. | Intent |
| REQ-004 | Stable requirement IDs traced from intent to spec, plan tasks and acceptance scenarios. Every requirement has at least one acceptance scenario tagged `@REQ-xxx`; scenarios are edited in the Spec, grouped by requirement. | Intent |
| REQ-005 | Stage gating: Intent needs the required template sections; Spec needs an approved intent; Plan needs a Go decision, at least one accepted scenario per requirement (the locked message names the requirements without one) and every design topic decided; Handoff needs an approved plan and a latest decision of Go. When the Form decision has a UI, Generate plan warns (Recommended) or stays locked (Required) without a current mock set, as set in the project settings. Locked stages say why. An approved document is not reopened by a review; it changes only through a change request, and the later documents it affects are marked out of date until the request is applied. | Intent |
| REQ-006 | Handoff writes the agent files into the project folder (AGENTS.md, CLAUDE.md, REVIEW.md, agent kit, standards as skills, failing acceptance scenarios, CI). It never overwrites a file Keel did not write without asking. Zip download is optional. Push to the folder's existing git remote is optional. Handoff merges with agent files that were in the folder when Keel initialised it (a marked Keel block in AGENTS.md, a pointer line in CLAUDE.md) and never replaces them. | Intent |
| REQ-007 | Read back the agent's commits and uncommitted edits to `docs/`, `tasks/` and `features/` from the local repository. Keel's own commits are ignored. Accept as a new version or dismiss. An accepted change to an approved document goes back to draft for a new approval. | Spec |
| REQ-008 | Version history for every document with readable diffs, the reason for each version, and its impact by requirement ID. Each new version records the change request that caused it. | Spec |
| REQ-009 | Model provider layer: Anthropic, OpenAI, Azure OpenAI and local OpenAI-compatible endpoints (Ollama). A model can be chosen per task. API keys and provider connections are stored in the user config folder, never in the project folder. Ollama on the same computer is the default provider. Keel lists the models installed there and offers them per task; no key is needed. | Spec |
| REQ-010 | For projects with a UI, Keel builds a prompt from the spec for an external model to create a clickable mock, and attaches the exported screens (PNG and HTML) as a mock set linked to screens and requirements. Each set records the spec version it came from and is marked out of date when the spec changes. Other references (links, images, PDF) can still be attached. No mock generation in Keel. | Spec |
| REQ-011 | Brainstorm styles as versioned skill files (Challenger, Coach, Cost and value, Market, Engineering-first), chosen at the start. | Spec |
| REQ-012 | Keel works on one project per folder. `npx keel [path]` opens the folder; a folder without `.keel/` opens on the Initialise screen, where the user sets title, description, templates, brainstorm style and standards. All project config and libraries are in `.keel/`, committed with the project. Opening a folder without `.keel/` starts with a local scan and a recommended path for four cases (new, already Keel, existing project, existing project with its own AI setup). For existing projects Keel can draft a baseline (intent, "as built" requirements, current stack as decisions) from files the user chooses to share, and proposes rules from existing agent files as a project standard. Opening a Keel folder checks the config version, pending changes and missing files. | Intent |
| REQ-013 | The spec's design is a set of decision topics. For each, the assistant proposes options from the requirements, constraints, standards and existing code, with one recommended; the user picks one or writes their own. Each choice is saved as a decision record and can be changed later (directly while the spec is a draft, through a change request after approval). | CR-0007 |
| REQ-014 | Change requests across stages. A change to an approved document becomes a change request in `changes/CR-NNNN/`: diff, size, approval for significant changes, impact on later documents by requirement ID with Update / Still valid / Later, and a change package for the coding agent. The Changes page lists every request in `changes/`, including ones written by hand, with a status computed from its header, its dependencies and its tasks. | CR-0003 |

## Approach

- **Form:** a local web app. `npx keel [path]` starts a server on `127.0.0.1` (first free port from 3000) for one folder and opens the browser. Single user, no login. See `docs/decisions/0005-local-web-app.md` and `docs/decisions/0009-one-project-per-folder.md`.
- **Stack:** TypeScript end to end. Next.js (App Router) for UI and API routes. See `docs/decisions/0006-typescript-stack.md`.
- **Storage:** The project folder is a git repository, also used by the coding agent. Keel keeps its config and libraries in `.keel/` (ADR-0010) and its documents in `docs/`, `tasks/` and `features/`. Keel commits only its own files. The SQLite index is `.keel/cache/index.db`, ignored by git and rebuildable. Personal settings and secrets are in the user config folder (ADR-0011).
- **Model providers:** one `ChatProvider` interface with adapters for Anthropic, OpenAI, Azure OpenAI and OpenAI-compatible endpoints. Streaming responses. API keys stored encrypted, never written to documents, git or logs.
- **Git:** handoff files are written into the folder. Push is optional, to the folder's existing remote, with the user's own git credentials. Read-back reads the local repository (ADR-0012).
- **Traceability:** a parser extracts REQ IDs from documents, task files and `@REQ-xxx` scenario tags into the index. Impact is computed from it.
- **UI:** follows the clickable mockup referenced in `docs/mocks/README.md`: Initialise, Project setup, Explore, Intent, Spec, Plan, Handoff, Roadmap, Changes, Templates, Brainstorm styles, Standards, Settings.

## Components

Document store · Template engine and library · Provider layer · Brainstorm service (templates and styles) · Traceability index · Stage gates and approvals · Version diff and impact · Mock references · Scaffold generator · Optional push · Read-back.

## Standards applied

Security baseline v2 · TypeScript conventions v3 · BDD style guide v1 · Small steps, tests first v1 (personal) · Plain markdown, readable without Keel v1 (project).

## Feasibility review

| Lens | Rating | Note |
| --- | --- | --- |
| Architecture fit | Good | Web app, markdown in git, provider layer: standard parts |
| Integration | Good | No GitHub API needed: handoff and read-back use the local repository; four LLM APIs |
| Security and data | Medium | API keys in the user config folder, never in the project (Security baseline v2, rules 1 to 3) |
| Effort | Medium | About 10 tasks for a single-user first version |
| Risk | Medium | Crowded spec-driven tools market; name not clear to use |
| Build or buy | Build | Existing tools start at the spec and target engineers |

## Flagged concerns

- **Name not clear to use.** "Keel" is used by several developer tools, and KEEL is a registered US trademark for computer programs. Fine as a codename; check before any public launch. Owner: Roberto Basile.
- **Crowded market (REQ-001, REQ-006).** GitHub Spec Kit, AWS Kiro and Traycer already cover spec, plan and code for engineers. Keel must stand out at the front of the process: intent, feasibility and the decision, for anyone.
- **Upstream changes (open question from the intent).** How a change upstream affects later documents is not in this spec. It is CR-0003, in Next on the roadmap.

## Acceptance scenarios

Written in Gherkin in `features/`, one or more per requirement, tagged `@REQ-xxx`, following the BDD style guide. They fail until implemented.

## Out of scope for v0.1

Code generation, multi-user roles and approvals, the Maintain stage, a VS Code extension, built-in mock generation, git providers other than GitHub, several projects in one Keel run.

## Version history

- v14: Ollama is the default provider, with local models listed (CR-0011).
- v13: opening a folder in four cases, baseline for existing projects (CR-0010).
- v12: clickable mock made elsewhere from the spec, attached as a versioned mock set (CR-0009).
- v11: design as decisions with options (CR-0007).
- v10: acceptance scenarios edited in the Spec, at least one per requirement (CR-0006).
- v9: change requests across stages (CR-0003).
- v8: Explore shows the template sections with live comments from the assistant (CR-0005).
- v7: one project per folder in the code repository, `.keel/` folder, read-back from local git, optional push (CR-0004).
- v6: REQ-007 refined: an accepted read-back change to an approved document goes back to draft for a new approval (owner decision, task T9).
- v5: REQ-005 refined: Handoff also needs the latest decision to be Go, and an approved document is not reopened by a review (owner decisions, task T6).
- v4: the traceability index is built from the project files when needed instead of being cached in keel.db (owner decision, task T5).
- v3: replaced the one-way handoff with read-back (REQ-007).
