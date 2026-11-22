# Keel user guide

This guide walks through Keel screen by screen. For what Keel is and how to install it, see the [README](../README.md).

Features marked **(coming: CR-NNNN)** are specified in `changes/` but not built yet.

## Contents

1. [Before you start](#1-before-you-start)
2. [Opening a folder](#2-opening-a-folder)
3. [Initialise](#3-initialise)
4. [Explore: write the idea, section by section](#4-explore-write-the-idea-section-by-section)
5. [Intent](#5-intent)
6. [Spec](#6-spec)
7. [Plan](#7-plan)
8. [Handoff](#8-handoff)
9. [Working with your coding agent and read-back](#9-working-with-your-coding-agent-and-read-back)
10. [Change requests](#10-change-requests)
11. [Roadmap](#11-roadmap)
12. [Library: templates, brainstorm styles, standards](#12-library-templates-brainstorm-styles-standards)
13. [Settings](#13-settings)
14. [Where Keel keeps things](#14-where-keel-keeps-things)
15. [Troubleshooting](#15-troubleshooting)
16. [Words used in Keel](#16-words-used-in-keel)

## 1. Before you start

- **Node.js 20+** and **git**.
- **A model.** Keel needs a language model to comment, draft and review:
  - **Ollama** on your computer (free, private, no key). Install it, then pull at least one model. A larger model (about 20B parameters or more) for spec and plan; a smaller one is enough for section comments.
  - Or a key for **Anthropic**, **OpenAI** or **Azure OpenAI**, or any **OpenAI-compatible** server.
- **A coding agent** for the build: Claude Code, Codex, Cursor or any agent that reads `AGENTS.md`.

Install Keel as described in the README (`npm install`, `npm link`).

**Startup check (coming: CR-0012).** Every time Keel starts, it checks your settings, that your model answers, that each task has a model, and that the project's config is valid. If something fails, Keel opens in setup mode: only Startup check and Settings are available until it is fixed.

## 2. Opening a folder

Run `keel` in a folder, or `keel path/to/folder`. One folder is one project, and it is the same git repository your coding agent builds in.

| The folder… | Keel… |
| --- | --- |
| does not exist | asks to create it (`--create` skips the question) |
| is empty, or has no code | opens **Initialise** for a new project |
| already has `.keel/` | opens at the current stage; if its config is older, offers to upgrade it in one commit |
| has code but no Keel **(coming: CR-0010)** | offers to **record what exists as a baseline** (recommended) or to treat the next feature as the project |
| has code and its own AI setup (AGENTS.md, CLAUDE.md, Cursor rules, Spec Kit specs) **(coming: CR-0010)** | as above, and keeps your agent files, proposes their rules as a project standard, and merges with them at handoff |

Nothing outside `.keel/` is written until you act. You can run Keel on several folders at once; each gets its own port.

## 3. Initialise

Set up the folder once:

- **Project folder**: the path, and `git init` if it is not a repository yet.
- **What Keel creates in this folder**: a short note per choice, and the full list of files Keel will write (open the folders to see them). Only `.keel/` is written now; documents follow as you approve them, and agent files at handoff.
- **The idea**: a working title and a sentence or two.
- **Intent template** and **brainstorm style** (Challenger, Coach, Cost and value, Market, Engineering-first). They are fixed once the brainstorm starts.
- **Document templates** for spec, plan, agent instructions, roadmap, acceptance tests and decisions.
- **Agent kit** (verifier, code simplifier, researcher, review policy) and **standards** (company, personal, project).

Press **Initialise and start brainstorm**. Keel copies the chosen templates, style and standards into `.keel/` and commits them. You can change these later in **Project setup**.

## 4. Explore: write the idea, section by section

Explore shows one field per section of your intent template. Required sections are marked; a progress line shows what is still needed.

- **Write in any order.** There is no send button.
- **The assistant reviews all sections together** when you leave a section you changed, or pause typing for a few seconds after a meaningful change. A status line shows "Reviewing all sections…" or when it last reviewed.
- **A comment sits on top of each section**:
  - **Challenge**: it questions the section and says why.
  - **Links sections**: this section conflicts with or depends on another.
  - **Suggestion** or **Question**: for empty or thin sections.
  - **Looks good.**
  The section you are in shows its comment in full; others show a one-line preview, and a **New comment** tag when it changed while you were elsewhere.
- **Reply** in the line under a comment and press Enter. The assistant answers there, with the whole list as context.
- **Your text is never rewritten.** The assistant fills only empty sections, as italic suggestions you **Accept** or **Clear**, and offers rewrites you **Apply** or **Dismiss**. A suggestion counts only once accepted.
- **Requirements** is a list: add, edit, move up or remove rows. Rows show "new" until you draft; then they get IDs (REQ-001…) that never change.

When every required section has text you wrote or accepted, **Draft intent.md** is enabled.

## 5. Intent

The Intent page shows `docs/intent.md` (Preview and Markdown tabs), its metadata, mock references, approval and version history.

- intent.md is **assembled from your Explore sections** with no model call: what you wrote is what is in the file.
- **To change it**, use **Change in Explore**. While the intent is a draft, drafting again makes a new draft version. Once it is approved, your edits are saved as a **change request** instead.
- **Approve** to unlock the Spec.

## 6. Spec

The Spec has five tabs.

- **Requirements**: every requirement with its ID and source (intent or spec).
- **Design**: one card per decision topic (Form, Language and framework, Storage, Model access, Testing, and any topic a requirement needs). The assistant proposes two or three options, each with an advantage, a drawback, the requirements it serves and whether it fits your standards and constraints; one is **Recommended**. Pick one or write your own, edit the reason, press **Decide**. Each choice becomes a decision record in `docs/decisions/`. **Change** reopens it (a change request once the spec is approved). If the folder already has code, **Keep current** is offered first.
- **Acceptance scenarios**: grouped by requirement. **Edit** a scenario (name, Given / When / Then steps), **+ Add scenario**, or **Suggest a failure case**. Every requirement needs at least one. The Gherkin tab shows the `.feature` text.
- **Flagged concerns**: what the feasibility review found, with the standard or rule behind each one.
- **Clickable mock (coming: CR-0009)**: Keel writes a prompt from the spec for an external model to build a clickable prototype. Refine it there, export the screens (PNG and HTML) with the names the prompt asks for, and drop them back in. Keel matches each file to a screen and its requirements and keeps the set tied to this spec version.

Then the **feasibility review** (architecture fit, integration, security, effort, risk, build or buy) and the **decision**: **Go**, **Park** or **No-go**, with the reason.

**Generate plan** needs a Go decision, a scenario for every requirement and every design topic decided (and a current clickable mock if you made it required in Settings).

## 7. Plan

`docs/plan.md` lists the tasks in order, each with its requirements and scenarios; every task has its own file in `tasks/`. Version history shows what changed between versions and what it affects, by requirement. Approve the plan to unlock Handoff.

## 8. Handoff

Handoff writes the files your coding agent needs into the project folder:

- `AGENTS.md` (instructions for any agent), `CLAUDE.md` (points to it), `REVIEW.md`;
- the agent kit as subagents in `.claude/agents/`, and your standards as skills in `.claude/skills/`;
- the acceptance scenarios in `features/` with failing step stubs, and a CI workflow.

The file list shows each file as **New**, **Changed**, **In folder** or **Conflict**. Keel never overwrites a file it did not write: for a conflict, choose **Keep mine**, **Use Keel's** or **Write beside**. **Write to folder** commits only Keel's files. **Download as zip** is also available.

**Push** is optional: if the folder has a git remote, Keel can push with your own git credentials. It never pushes on its own.

## 9. Working with your coding agent and read-back

1. Open your coding agent in the project folder. It starts from `AGENTS.md`.
2. Ask it to work through the tasks in order, making each task's scenarios pass.
3. Keel watches the folder: the agent's **commits and uncommitted edits** to `docs/`, `tasks/` and `features/` appear on the Handoff page under **Read-back**. Keel's own commits are ignored.
4. For each change: **Accept** saves it as the document's next version (an approved document goes back to draft for a new approval); **Dismiss** hides it.

Tip: keep one agent session per task or change request, and review before starting the next.

## 10. Change requests

An approved document is never reopened: it changes through a **change request**.

**Where they come from**: editing an approved intent in Explore, changing a design decision after the spec is approved, a new mock set, "Raise change request" on the Roadmap, **New change request** on the Changes page, or a folder you write by hand in `changes/`.

**The Changes page** lists every request in `changes/`, with:

- its **status**: Draft, Waiting for approval, Approved · ready, Approved · waiting for CR-NNNN (a request it depends on), In progress (some tasks done), Applied (all tasks done), Rejected;
- its requirements, task progress and origin (Keel or written by hand);
- **Next to apply**, with **Copy prompt for the agent**.

**One request** shows what changed, its size (minor or significant) and approval, the **impact on later documents by requirement** (choose **Update**, **Still valid** or **Later** for each), and the **change package** for the agent. While an approved significant request is not applied, the documents it affects are marked **Out of date · CR-NNNN**.

**Plan the change (coming: CR-0013)**: the assistant breaks the request into new tasks with the files likely to change (from a code map of file names), suggests scenarios, and links decision records and mock screens. The package then follows your templates, and `changes/README.md` lists every open request in order.

**A change request folder**:

```
changes/CR-NNNN/
  CR-NNNN.md      the request: why, what changes, requirement changes, impact, done when
  PROMPT.md       what to paste into your coding agent
  tasks/          new tasks for the change
  features/       new or changed scenarios
  decisions/      decision records (optional)
```

To apply one: paste its `PROMPT.md` into your coding agent, review the result, merge, and go on to the next.

## 11. Roadmap

`docs/roadmap.md` in four columns: **Now** (read-only, from the spec and plan; the only scope the agent builds), **Next**, **Later** and **Not doing** (collapsed). **Add idea** puts an item in Next or Later; Keel also suggests items from out-of-scope lists, parked ideas and the brainstorm. **Start work** on an item either raises a change request (if it extends this project) or gives you the command to start it in its own folder (if it is separate).

## 12. Library: templates, brainstorm styles, standards

Everything lives in `.keel/` and is versioned with the project.

- **Templates** (`.keel/templates`), grouped by kind: intent, spec, plan, agent instructions, decision records, roadmap, agent kit, and (coming: CR-0013) change request, prompt for the coding agent, task and changes index. Each template defines its metadata and sections (required or optional). A template in use cannot be removed; a new version is a new file.
- **Brainstorm styles** (`.keel/styles`): skill files that set how the assistant comments: Challenger, Coach, Cost and value, Market (can search the web), Engineering-first.
- **Standards** (`.keel/standards`): conventions and guidelines (company, personal, project) that the spec and plan are checked against and that the agent receives as skills.

When opened from Initialise or Project setup, these pages show a **Back to** bar.

## 13. Settings

Two parts:

**You, on this computer** (`~/.config/keel`, never committed):

- **Model provider**: Ollama (default, coming: CR-0011, with the models installed on this computer listed), Anthropic, OpenAI, Azure OpenAI, or another OpenAI-compatible server. Keys are stored encrypted. **Test connection** / **Check again**.
- **Model per task**: section comments, spec and plan, feasibility review.
- **Author name** (from `git config user.name`).
- **Explore reviews**: pause before a review and the minimum interval.

**This project** (`.keel/config.yml`, committed):

- **Templates for new documents**: intent, spec, plan, agent instructions, roadmap, brainstorm style, and (coming: CR-0013) task, change request, prompt for the coding agent and changes index.
- **Folders**: where documents, tasks and scenarios go (default `docs`, `tasks`, `features`).
- **Commits**: commit Keel's files automatically, or write them and commit yourself.
- **Read-back**: how often to check the folder.
- **Clickable mock before the plan** (coming: CR-0009): Recommended, Required or Off.
- **Code map for planning changes** and **Keep changes/README.md up to date** (coming: CR-0013).

## 14. Where Keel keeps things

In the project folder (committed, except the cache):

```
.keel/
  config.yml        project settings, chosen templates, style, standards, paths
  templates/  styles/  standards/  agent-kit/
  brainstorm/       Explore sections, comments and threads
  mocks/            mock files you attach
  cache/            search index (not committed, rebuilt when needed)
docs/
  intent.md  spec.md  plan.md  roadmap.md
  decisions/        decision records
tasks/              one file per task
features/           acceptance scenarios
changes/            change requests
AGENTS.md  CLAUDE.md  REVIEW.md  .claude/   written at handoff
```

On your computer only: `~/.config/keel/` (settings, encrypted keys, the key that encrypts them). Override with `KEEL_USER_DIR`.

Keel commits only its own files, with messages starting "Keel:", and never during a merge or rebase.

## 15. Troubleshooting

| Problem | What to do |
| --- | --- |
| The browser does not open | Open the address Keel prints (`http://127.0.0.1:<port>`), or run without `--no-open`. |
| "Ollama is not running" | Start the Ollama app or run `ollama serve`, then **Check again**. Or choose another provider in Settings. |
| A task's model is missing | Pick another model in Settings › Model per task, or `ollama pull <name>`. |
| Comments are slow | Use a smaller model for section comments, or raise the pause in Settings › Explore reviews. |
| "Finish the merge in git, then try again" | Keel does not commit during a merge, rebase or cherry-pick. Finish it in git. |
| A document changed outside Keel | It appears in Read-back; accept or dismiss it. Keel never overwrites an edited file. |
| Handoff shows a conflict | The file exists and Keel did not write it: Keep mine, Use Keel's, or Write beside. |
| The project config is invalid | Fix it in Project setup or restore `.keel/config.yml` from git. Keel does not change it on its own. |
| The index looks wrong | `npm run keel -- reindex --dir <folder>` rebuilds it from the files. |

## 16. Words used in Keel

| Word | Meaning |
| --- | --- |
| Intent | What the idea is and why: problem, users, outcome, requirements. |
| Spec | Requirements, design decisions, acceptance scenarios, feasibility and the Go, Park or No-go decision. |
| Plan | Ordered tasks that build the spec. |
| Requirement ID | REQ-001…: stable, never reused; links intent, spec, tasks, scenarios and mock screens. |
| Scenario | A Given / When / Then acceptance test, tagged with its requirement. |
| Decision record | A short file in `docs/decisions/` with a choice, the reason and the alternatives. |
| Handoff | Writing the agent files into the folder. |
| Read-back | Reviewing what the coding agent changed in documents and tasks. |
| Change request | How an approved document changes: impact by requirement, approval, and a package for the agent. |
| Brainstorm style | How the assistant comments (Challenger, Coach…). |
| Standard | A rule the spec, plan and code are checked against, shipped to the agent as a skill. |
