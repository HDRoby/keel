---
id: ADR-0016
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-22
change: CR-0014
---

# Publish as keel-sdlc with a standalone build; the command stays keel

## Decision

Keel is published to npm as `keel-sdlc`, with a production build made with Next.js `output: 'standalone'` inside the package. `npx keel-sdlc [path]` starts it on a folder; installed globally, the command is `keel`. Only the release workflow publishes, on a version tag, with provenance. The licence is MIT.

## Reason

Running Keel should not need a clone, an install of dev dependencies or a build. A standalone build starts in seconds and carries only what the server needs.

## Alternatives considered

- Running from a clone (as before): fine for developing Keel, too many steps for using it.
- Installing from GitHub with a `prepare` build: a slow first run and dev dependencies on every machine.
- A single executable or a desktop app: later, if users ask for it.

## Consequences

- Keel finds its own files (seed library, static assets) from its install folder, not the current directory; `KEEL_SEED` still overrides.
- A test fails if a dependency with native code is added.
- CI packs the build and runs it on macOS, Linux and Windows on every push.
