---
id: ADR-0008
project: PRJ-0001
template: decision-record@1
status: superseded by ADR-0012
date: 2026-11-20
---

# Read-back by polling the repository

## Decision

Keel checks pushed repositories on a schedule (default every 15 minutes, or on demand) using the GitHub API.

## Reason

A local app cannot receive GitHub webhooks without a tunnel.

## Consequences

Changes appear with a delay. Keel ignores its own commits.
