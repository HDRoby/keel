---
id: ADR-0006
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-20
---

# TypeScript full stack with Next.js

## Decision

One TypeScript codebase: Next.js (App Router) for UI and API routes; Vitest for unit tests; Playwright with playwright-bdd for Gherkin scenarios.

## Reason

One language end to end, a rich UI for boards and diffs, and good support from coding agents.

## Consequences

Node.js is required to run Keel locally.
