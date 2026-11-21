---
id: ADR-0003
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-20
---

# Read back agent changes instead of a one-way handoff

## Decision

After the handoff, Keel reads changes to docs/ and tasks/ back from the repository.

## Reason

Coding agents change the plan as they build. Without read-back, Keel's copy goes stale and the audit trail breaks.

## Consequences

Adds REQ-007 and task T9. Two-way sync stays out of scope.
