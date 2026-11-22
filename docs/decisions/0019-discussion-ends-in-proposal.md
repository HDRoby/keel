---
id: ADR-0019
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-22
change: CR-0016
---

# A discussion ends in a structured proposal; only the user's Agree creates the change request

## Decision

In Discuss a change (REQ-017) the assistant never writes files and never chooses IDs. When the discussion settles, it ends a reply with one `keel-proposal` JSON block in a fixed format. Keel validates and checks it without a model and shows it as a Proposed change request card. Only the user's Agree button creates the change request: Keel then assigns the IDs, writes the package with the change package writer (CR-0013) and keeps the discussion with it as `discussion.md`, in one Keel commit. Discussions are committed with the project, for traceability (owner decision, 2026-11-22).

## Reason

A structured proposal works the same with every provider, including small local models, and can be checked before anything is written. A button is unambiguous; the user's text is not.

## Alternatives considered

- The model writes the files with tool calls: not reliable across providers, and Ollama models vary.
- Detecting agreement from the user's text ("yes, go ahead"): ambiguous.

## Consequences

- An invalid proposal is asked for again once, then shown as text.
- Discussion files never hold attachment contents or anything that matched a key pattern.
