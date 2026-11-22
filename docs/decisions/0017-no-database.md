---
id: ADR-0017
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-22
change: CR-0014
supersedes: ADR-0007
---

# No database: documents, versions and traceability come from the files and git

## Decision

Keel reads documents, versions, diffs and traceability straight from the markdown files and git. There is no SQLite index and no `better-sqlite3` dependency. `.keel/cache/` keeps only the run lock.

## Reason

Nothing read the index: every view already came from the files and git, which are fast enough for one project per folder. The native module was the only part of Keel that had to be compiled per platform, which blocks a plain-JavaScript package (`npx keel-sdlc`).

## Alternatives considered

- Keep the index for later search: adds a native build to every install for a feature nobody uses yet.
- A pure-JavaScript database: still a second copy of what git already holds.

## Consequences

- ADR-0007 is superseded; git stays the single source of truth.
- The `reindex` command and the one-off v0.1 settings migration are removed.
- If search is ever needed, it reads the files.
