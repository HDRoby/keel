---
id: ADR-0012
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-22
change: CR-0004
supersedes: ADR-0008
---

# Read-back from the local git repository

## Decision

Keel reads the coding agent's changes from the project folder itself:

- **Commits** since the last handled commit that touch `docs/`, `tasks/` or `features/` and are not Keel's own (author `keel@localhost` or a `Keel: ` subject).
- **Uncommitted edits** to those paths in the working tree, labelled "Uncommitted".

Keel checks when a page gets focus, on "Check now", and every `KEEL_READBACK_SECONDS` (default 60; 0 turns it off). No fetch, no GitHub API.

## Reason

The agent works in the same folder (ADR-0009), so the changes are already on disk. Reading them locally is instant and needs no token.

## Consequences

- ADR-0008 (polling GitHub) is superseded.
- CI results per requirement stay optional: shown only when the remote is on GitHub and a token is set in the user settings.
- Accepting an uncommitted edit saves it as the document's next version and commits it as a Keel commit.
