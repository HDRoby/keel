---
id: ADR-0004
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-20
---

# Mock references, not built-in mock generation

## Decision

Keel attaches mocks made elsewhere (links, images, PDF, HTML) and links them to requirements. It does not generate mocks.

## Reason

Generation is a product of its own (sandboxing, versions, cost) and better tools exist. References keep most of the value: visual alignment and a reference for the agent.

## Consequences

Adds REQ-010. Built-in generation moves to Later on the roadmap (PRJ-0005).
