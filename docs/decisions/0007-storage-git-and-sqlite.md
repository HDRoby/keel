---
id: ADR-0007
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-20
---

# Git as source of truth, SQLite as index

## Decision

Each project is a git repository of markdown documents with YAML front matter. A local SQLite file caches metadata, the traceability index, versions and settings.

## Reason

Git gives history, diffs and a portable audit trail; documents stay readable without Keel (Plain markdown standard). SQLite keeps views fast.

## Consequences

The index must be rebuildable from git at any time (`keel reindex`).
