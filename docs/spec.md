---
id: SPC-0001
project: PRJ-0001
title: Keel
author: Roberto Basile
created: 2026-11-20
updated: 2026-11-20
status: approved
version: 6
template: requirements-and-design-spec@2
from_intent: INT-0001@2
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
| REQ-001 | Template-driven brainstorm with an LLM. The assistant asks about the missing sections of the intent template chosen at the start. | Intent |
| REQ-002 | `intent.md` with metadata: ID, project, author, created, updated, status, version, template, brainstorm style. | Intent |
| REQ-003 | Versioned, editable templates for intent, spec, plan, roadmap, decision records, agent instructions and the agent kit. A template used by any project cannot be removed. | Intent |
| REQ-004 | Stable requirement IDs traced from intent to spec, plan tasks and acceptance scenarios. | Intent |
| REQ-005 | Stage gating: Intent needs the required template sections; Spec needs an approved intent; Plan needs a Go decision; Handoff needs an approved plan and a latest decision of Go. Locked stages say why. An approved document is not reopened by a review; it changes through a change request. | Intent |
| REQ-006 | Hand off a repository scaffold any coding agent can build from: AGENTS.md, docs, tasks, failing acceptance scenarios, agent kit, standards, CI. As a zip or pushed to GitHub. | Intent |
| REQ-007 | Read back changes the agent makes to `docs/` and `tasks/` in the repository; accept them as new versions or dismiss them. An accepted change to an approved document goes back to draft for a new approval. | Spec |
| REQ-008 | Version history for every document with readable diffs, the reason for each version, and its impact by requirement ID. | Spec |
| REQ-009 | Model provider layer: Anthropic, OpenAI, Azure OpenAI and local OpenAI-compatible endpoints (Ollama). A model can be chosen per task. | Spec |
| REQ-010 | Attach mock references (links, images, PDF, HTML) to the intent and spec and link them to requirements. No mock generation. | Spec |
| REQ-011 | Brainstorm styles as versioned skill files (Challenger, Coach, Cost and value, Market, Engineering-first), chosen at the start. | Spec |

## Approach

- **Form:** a local web app. `npx keel` (or `npm run dev` from source) starts a Next.js server on `localhost` and opens the browser. Single user, no login. See `docs/decisions/0005-local-web-app.md`.
- **Stack:** TypeScript end to end. Next.js (App Router) for UI and API routes. See `docs/decisions/0006-typescript-stack.md`.
- **Storage:** a workspace folder (default `~/.keel/`). Each project is a git repository under `~/.keel/projects/<slug>/` holding its markdown documents with YAML front matter. A SQLite file (`~/.keel/keel.db`) caches metadata and versions, and holds settings. The traceability index is built from the project files when needed, not cached. Git is the source of truth; the index can be rebuilt from it. See `docs/decisions/0007-storage-git-and-sqlite.md`.
- **Model providers:** one `ChatProvider` interface with adapters for Anthropic, OpenAI, Azure OpenAI and OpenAI-compatible endpoints. Streaming responses. API keys stored encrypted, never written to documents, git or logs.
- **GitHub:** push the handoff with a fine-grained personal access token (or OAuth device flow). Read-back works by polling the repository on a schedule, because a local app cannot receive webhooks. See `docs/decisions/0008-read-back-by-polling.md`.
- **Traceability:** a parser extracts REQ IDs from documents, task files and `@REQ-xxx` scenario tags into the index. Impact is computed from it.
- **UI:** follows the clickable mockup referenced in `docs/mocks/README.md`: Projects, Start, Project setup, Explore, Intent, Spec, Plan, Handoff, Roadmap, Changes, Templates, Brainstorm styles, Standards, Settings.

## Components

Document store · Template engine and library · Provider layer · Brainstorm service (templates and styles) · Traceability index · Stage gates and approvals · Version diff and impact · Mock references · Scaffold generator · GitHub push · Read-back.

## Standards applied

Security baseline v2 · TypeScript conventions v3 · BDD style guide v1 · Small steps, tests first v1 (personal) · Plain markdown, readable without Keel v1 (project).

## Feasibility review

| Lens | Rating | Note |
| --- | --- | --- |
| Architecture fit | Good | Web app, markdown in git, provider layer: standard parts |
| Integration | Medium | GitHub API for push and read-back; four LLM APIs |
| Security and data | Medium | Stores API keys and repository tokens (Security baseline v2, rules 1 to 3) |
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

Code generation, multi-user roles and approvals, change requests across stages (CR-0003, Next), the Maintain stage, a VS Code extension, built-in mock generation, git providers other than GitHub.

## Version history

- v6: REQ-007 refined: an accepted read-back change to an approved document goes back to draft for a new approval (owner decision, task T9).
- v5: REQ-005 refined: Handoff also needs the latest decision to be Go, and an approved document is not reopened by a review (owner decisions, task T6).
- v4: the traceability index is built from the project files when needed instead of being cached in keel.db (owner decision, task T5).
- v3: replaced the one-way handoff with read-back (REQ-007).
