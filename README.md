# Keel

Keel turns an idea into a project a coding agent can build, and keeps the documents and the code in step afterwards.

You describe the idea, an assistant challenges it section by section, and Keel turns the result into an approved **intent**, a **spec** with design decisions, acceptance scenarios and a feasibility review, and a **plan** of tasks. It then writes the instructions for your coding agent (Claude Code, Codex, Cursor or any other) into the same folder, reads back what the agent changes, and handles later changes as **change requests** with their impact traced by requirement ID.

Keel does not write code. It does the thinking and paperwork before the code, and keeps track of it afterwards.

## Who it is for

- **A product-minded engineer** who wants a clear intent, spec and plan before letting an agent build.
- **Product managers and anyone with an idea**, who need a guided way to get from "I have an idea" to something an engineer or agent can act on, without installing developer tools.
- **Teams already using coding agents** who want requirements, decisions and acceptance tests that stay traceable as the code changes.

## What it does

| Stage | What you do | What Keel produces |
| --- | --- | --- |
| **Explore** | Fill in the sections of an intent template (Problem, Who it is for, Desired outcome, Scope, Requirements, Constraints, Open questions). An assistant comments on each section, links sections that conflict, and suggests text you accept or clear. | A brainstorm you can resume, in `.keel/brainstorm/` |
| **Intent** | Review and approve. | `docs/intent.md`, assembled from your sections (no model writes it), with stable requirement IDs (REQ-001…) |
| **Spec** | Review requirements, choose design options the assistant proposes, edit acceptance scenarios (at least one per requirement), read the feasibility review, decide Go, Park or No-go. Optionally get a clickable mock made elsewhere from a prompt Keel writes. | `docs/spec.md`, decision records in `docs/decisions/`, scenarios in `features/` |
| **Plan** | Review the ordered tasks, their requirements and scenarios. | `docs/plan.md`, one file per task in `tasks/` |
| **Handoff** | Write the agent files into the folder; push if you want. | `AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, subagents and standards as skills, failing scenario stubs, CI |
| **Read-back** | Let your coding agent work. | The agent's commits and edits to documents and tasks, shown for you to accept or dismiss |
| **Changes** | Change an approved document, or write a change request by hand. | `changes/CR-NNNN/` with the request, impact by requirement, a prompt and tasks for the agent, and a status Keel tracks |

Along the way: versioned templates, brainstorm styles and standards in `.keel/`; stage gates so nothing moves on until the previous step is approved; and version history with readable diffs.

## Principles

- **One project per folder.** The folder is the same git repository your coding agent builds in. Keel's config and libraries live in `.keel/`; its documents in `docs/`, `tasks/`, `features/` and `changes/`.
- **Plain markdown in git.** Every document is readable and diffable without Keel.
- **Your text is yours.** The assistant comments and suggests; it never rewrites what you wrote on its own.
- **Any model, any agent.** Ollama on your computer by default; Anthropic, OpenAI, Azure OpenAI or any OpenAI-compatible server if you prefer. Any coding agent that reads `AGENTS.md`.
- **Secrets stay on your computer.** Keys and personal settings live in `~/.config/keel`, never in the project folder or git.

## Quick start

You need **Node.js 20 or later** and **git**. For local models, install **[Ollama](https://ollama.com)** and pull a model (for example `ollama pull qwen3:32b`).

Run it on a folder:

```
npx keel-sdlc                      # open the current folder
npx keel-sdlc ~/projects/my-idea   # open another folder, or create it
```

Or install it once and use the `keel` command:

```
npm i -g keel-sdlc
keel ~/projects/my-idea
```

Keel checks your settings and model access, then opens your browser. A new folder starts on **Initialise**; a folder that already uses Keel opens where you left off.

> Until the first release of `keel-sdlc`, run it from a clone: `npm install`, `npm run build`, `npm link`, then `keel`. Note that `npx keel` runs an unrelated package with that name.

**→ The full [user guide](docs/user-guide.md)** covers every screen, the folder layout, working with a coding agent, change requests and troubleshooting.

## Command line

With `npx`, write `npx keel-sdlc` instead of `keel`.

```
keel [path] [--title "..."] [--description "..."] [--port N] [--no-open] [--create] [--dry-run] [--version] [--help]
keel import <v0.1 project folder> --dir <folder>
```

| Option | What it does |
| --- | --- |
| `path` | The project folder (default: the current folder) |
| `--create` | Create the folder if it does not exist, without asking |
| `--title`, `--description` | Prefill the Initialise screen |
| `--port N` | Use this port (default: the first free one from 3000); each folder gets its own |
| `--no-open` | Do not open the browser |
| `--dry-run` | Print what would run, and exit |
| `--version` | Print the version |
| `import` | Import a Keel v0.1 project into a folder |

## Developing Keel

This repository is built with Keel's own process: `docs/` holds Keel's intent, spec, plan and decisions, `tasks/` the tasks, `features/` the acceptance scenarios, and `changes/` the change requests being applied. Coding agents start with `AGENTS.md`.

| Task | Command |
| --- | --- |
| Install from a clone | `npm install`, then `npm link` for the `keel` command |
| Dev server on a folder | `KEEL_PROJECT_DIR=/path/to/folder npm run dev` |
| Import a v0.1 project | `npm run keel -- import <old project folder> --dir /path/to/folder` |
| Unit tests | `npm test` |
| Acceptance scenarios | `npm run test:bdd` |
| Lint and types | `npm run lint` and `npm run typecheck` |
| Everything CI runs | `npm run verify` |
| UI gallery | `/dev/ui` on the dev server |
| Standalone build | `npm run build`; `keel` then starts it instead of the dev server |
| Package smoke test | `npm pack`, then `npm run smoke` |
| Release | Push a tag `vX.Y.Z` that matches `package.json`; only the release workflow publishes |

```
docs/          intent, spec, plan, roadmap, decisions, UI guide and styles, mock references
tasks/         one file per task (T1… from the plan, R1… from change requests)
features/      Gherkin acceptance scenarios, tagged with requirement IDs
changes/       change requests: one folder each, with a prompt for the coding agent
seed/          templates, brainstorm styles, agent kit and standards Keel ships with
src/           the app (Next.js, TypeScript)
.claude/       subagents and skills for Claude Code (other agents read AGENTS.md)
```

## Status

Keel v0.1 plus the change requests in [`changes/README.md`](changes/README.md). Applied so far: CR-0003 to CR-0014. Still to come: the AI readiness report (CR-0015) and discussing a change (CR-0016). The user guide marks features that are not built yet.

"Keel" is a working name.
