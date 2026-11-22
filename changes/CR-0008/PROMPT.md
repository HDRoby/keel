# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0007 is done.

---

Implement change request CR-0008 in `changes/CR-0008/`. Read `CR-0008.md`, then `docs/ui-guide.md` (after step 1), then `AGENTS.md`.

1. Apply "Changes to apply to the documents": add `docs/ui-guide.md`, copy `mock-source/*` to `docs/mocks/source/`, update `docs/mocks/README.md`, `AGENTS.md` and `docs/plan.md` (v11). Copy `tasks/R13.md` to `tasks/`. Commit.
2. Implement R13 step by step, one commit per step and per screen: `R13: <step or screen>`. Keep `npm run verify` green after every commit.
3. Before reporting, run `npm run ui:shots` and compare each screenshot with its mock source and the checklist in `docs/ui-guide.md`. Fix what you can; list what you could not.
4. Do not delete files without asking. Do not change behaviour; if the look needs a behaviour change, ask.
