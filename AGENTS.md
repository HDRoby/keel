# AGENTS.md

Instructions for any coding agent building Keel v0.1.

## Read first

1. `docs/intent.md` — what we want and why (INT-0001 v2, approved)
2. `docs/spec.md` — requirements REQ-001 to REQ-011 and the design (SPC-0001 v3, Go decision)
3. `docs/plan.md` — ordered tasks and test strategy (PLN-0001 v4, approved)
4. `docs/roadmap.md` — what is in scope now, and what is not
5. `docs/decisions/` — why things are the way they are

## Scope

- Build only what is in **Now** in `docs/roadmap.md`. Do not start Next or Later items.
- Do not add features that no requirement asks for. If you think one is missing, write it under "Questions for the owner" in the task file and stop.
- Keel never generates application code for its users. It stops at the plan and the repository scaffold.

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Unit tests: `npm test` (Vitest)
- Acceptance scenarios: `npm run test:bdd` (Playwright + playwright-bdd)
- Lint: `npm run lint` (zero warnings)
- Types: `npm run typecheck`
- All of the above: `npm run verify`

Package versions in `package.json` are starting points. Update them to the current stable releases in task T0 if needed, and record it in the commit message.

## How to work

1. Take the next task in `tasks/` in order (T1, T2, …). Each task lists its requirements, the scenarios that prove it, and the files it should touch.
2. The scenarios in `features/` already exist and fail. Implement the step definitions in `features/steps/` and the code until they pass.
3. **Never edit `.feature` files to make a scenario pass.** If a scenario looks wrong, stop and write it under "Questions for the owner" in the task file.
4. If your work departs from `docs/plan.md`, update `docs/plan.md` in the same commit and say why. Keel reads these changes back.
5. Keep each task in one pull request, ideally under about 300 changed lines.
6. UI work follows `docs/ui-guide.md` and the screen sources in `docs/mocks/set-1/source/` (the current mock set). Use the components in `src/components/ui/`; add a component there before using a new pattern.

## Conventions

These come from the standards selected for this project. Claude Code loads them as skills from `.claude/skills/`; other agents follow this summary.

- **Security baseline v2:** never write secrets or API keys to code, documents or logs; store credentials encrypted; least-privilege tokens; validate all external input.
- **TypeScript conventions v3:** strict mode, no implicit `any`; one module per file; named exports; errors as typed results; a unit test for every public function.
- **BDD style guide v1:** one behaviour per scenario; describe behaviour, not clicks; tag every scenario with its requirement.
- **Small steps, tests first v1:** small tasks; failing test first; short pull requests; update the plan in the same commit.
- **Plain markdown v1 (project):** every generated document is plain markdown with a YAML header and stays readable without Keel.

## Verifying your work

Run before reporting any task done, and paste the output:

```
npm run verify
```

Healthy output ends with all unit tests passing, all scenarios for the task passing, and zero lint or type errors. If a test fails, fix the code, not the test.

## Agent roles

Claude Code uses the subagents in `.claude/agents/`. Other agents: apply these roles yourself.

- **Verifier** (after each task): run the app, run the task's scenarios, compare behaviour with `docs/plan.md` and the REQ IDs. Report only; do not fix.
- **Code simplifier** (after each task): remove duplication and needless abstraction without changing behaviour; tests must still pass; never touch `features/*.feature`.
- **Researcher** (when you need context): read the code and docs and answer with file paths; never edit.

## Done means

- Every scenario tagged with the task's requirements passes in CI.
- `npm run verify` passes.
- `docs/plan.md` matches what was built.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
