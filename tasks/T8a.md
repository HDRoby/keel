---
id: T8a
plan: PLN-0001@6
requirements: [REQ-006]
status: done
---

# T8a · Scaffold generator (zip)

## Goal

Generate the handoff package from the approved documents and the selected templates, agent kit and standards, as a zip.

## Scenarios that prove it

- `features/handoff.feature` › The scaffold contains the documents and failing stubs (@REQ-006)

## Files that are likely to change

- `src/lib/handoff/scaffold.ts`
- `src/lib/handoff/secrets-scan.ts`
- `src/app/projects/[id]/handoff/page.tsx`

## Notes

- This repository is an example of the output.
- Scan the package for key and token patterns before writing it; fail if any are found.
- Claude Code gets .claude/agents and .claude/skills; every agent gets the same guidance in AGENTS.md.
- As built:
  - `src/lib/handoff/scaffold.ts` builds the package once the Handoff stage is open. It contains:
    - AGENTS.md from the agents template, with Read first, How to work and Done means filled in, and the commands, standards and agent roles.
    - CLAUDE.md, and REVIEW.md from the review template.
    - docs/: intent, spec, plan and decisions; mocks when there are any; roadmap (the project's own, or Now from the intent's requirements); and traceability.json.
    - tasks/.
    - features/*.feature, with one failing playwright-bdd stub per step in `features/steps/` (`src/lib/handoff/stubs.ts`). A step shared between features is defined once.
    - The agent kit in `.claude/agents/` with its placeholders filled, the chosen standards in `.claude/skills/<id>/SKILL.md`, `.github/workflows/ci.yml`, and a README.
    - Keel's internal files (brainstorm.md, project.md, .keel/) are left out.
  - Commands: Keel does not know the project's stack, so the Handoff page asks for install, run, unit tests, acceptance scenarios and all checks. They are saved as `handoff` in project.md and default to npm.
  - Secret scan (`src/lib/handoff/secrets-scan.ts`) runs on every file before the zip is written. It looks for key and token patterns (Anthropic, OpenAI, GitHub, AWS, Slack, Google, private keys, key assignments) and for the actual keys stored in Settings. Any finding stops the package, and the message names the file, line and kind, never the value.
  - Zip: a small writer and reader on Node's zlib (`src/lib/handoff/zip.ts`); no new dependency. `GET /api/projects/[id]/handoff` serves `<slug>-handoff.zip`.
- Fixed after the final verification: every template placeholder in the package is filled (the agent kit had `{{traceability_path}}` and `{{verify_command}}` left), and building refuses a package that still has one. REVIEW.md's "What Important means here" and "Do not report" have defaults.

## Questions for the owner

Answered by the owner on 2026-11-20:

1. Step stubs for other stacks: no. TypeScript with playwright-bdd only.
2. No project files: include a minimal setup for the default stack. Done: with npm commands the package adds `package.json` (scripts for the commands: unit tests with Vitest, scenarios with playwright-bdd, verify running both, and a `dev` placeholder until the app exists), `tsconfig.json`, `playwright.config.ts` and `.gitignore`. CI also installs the Playwright browser. Checked by unpacking a package and running its `npm run verify`: the unit tests pass, and every scenario fails on its "Not implemented" stub. That is the intended starting point. Other stacks get no setup.
3. Agent kit selection: OK for v0.1 as built (every agent-kit template goes in).
