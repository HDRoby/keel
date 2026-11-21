---
id: ADR-0002
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-20
---

# A web UI, not a VS Code extension

## Decision

Keel is a web app, not a VS Code extension or a Claude-specific plugin.

## Reason

The people with ideas include product managers and others who do not use VS Code. A web UI also keeps Keel independent of any one editor or model vendor.

## Consequences

No editor integration in v0.1. The handoff package is how Keel reaches the coding tools.
