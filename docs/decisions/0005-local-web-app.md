---
id: ADR-0005
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-20
---

# Keel v0.1 is a local web app

## Decision

v0.1 runs on the user's machine: `npx keel` starts a local server and opens the browser.

## Reason

Single user, no login, and API keys and repositories stay local. A self-hosted server or hosted service needs accounts and security work that v0.1 does not need.

## Consequences

Read-back must poll (no webhooks to localhost). A server edition can come later with multi-user.
