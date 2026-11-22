---
id: ADR-0009
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-22
change: CR-0004
---

# One project per folder; the folder is the code repository

## Decision

Keel works on one project at a time. `npx keel [path]` opens one folder, which is the same git repository the coding agent builds code in. Keel's documents live there next to the code. There is no Projects page.

An idea for this project goes on its roadmap or becomes a change request. An unrelated idea gets its own folder and its own Keel run.

## Reason

One repository holds the intent, spec, plan, tasks, scenarios and code, so the agent and Keel read the same files. The separate handoff repository, the push step and the project list go away.

## Consequences

- Keel writes into a repository that also holds the user's and the agent's work, so it commits only its own paths (ADR-0010) and never overwrites a file it did not write without asking.
- Several Keel runs can be open at once, one per folder, each on its own port.
- Project IDs stay `PRJ-0001` style but are only unique within the folder.
