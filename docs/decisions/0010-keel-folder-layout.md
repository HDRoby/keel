---
id: ADR-0010
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-22
change: CR-0004
---

# Layout of the .keel folder

## Decision

```
<project folder>/
  .keel/
    config.yml        project id, title, description, author, created,
                      templates chosen per kind, brainstorm style, standards,
                      paths (docs, tasks, features), commit mode,
                      read-back state, next requirement number
    templates/        copied from the built-in seed at Initialise
    styles/           brainstorm styles (SKILL.md files)
    standards/        standards as skills
    agent-kit/        subagents and REVIEW.md template
    brainstorm/       brainstorm transcripts
    mocks/            mock reference files (images, PDF, HTML) and references.md, their index
    generated/        what Keel last generated, for three-way regeneration
    cache/            index.db, run.json and read-back state; ignored by git
    .gitignore        contains "cache/"
  docs/               intent.md, spec.md, plan.md, roadmap.md, decisions/
  tasks/              task files
  features/           acceptance scenarios (the agent writes the steps)
  AGENTS.md, CLAUDE.md, REVIEW.md, .claude/   written by Handoff
```

`docs`, `tasks` and `features` can be renamed in `config.yml` when the repository already uses those names.

**Keel's own paths** are `.keel/` (except `cache/`), the documents Keel created in `docs/`, `tasks/` and `features/`, and the handoff files. Keel commits only these paths, with author `Keel <keel@localhost>` and a `Keel: ` subject.

## Reason

All config and libraries travel with the project and are versioned with it. A reviewer sees which template and standard versions produced each document. The cache stays out of git.

## Consequences

- Initialise seeds `templates/`, `styles/`, `standards/` and `agent-kit/` from the built-in seed (and later from the personal library, see roadmap).
- Removing a template is blocked while a document in this folder uses it.
- `config.yml` must never hold a secret (ADR-0011). A test scans `.keel/` for key patterns.

## Amendment (CR-0014, 2026-11-22)

`cache/` holds the run lock (`run.json`) only. There is no index database since ADR-0017.
