# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0005 is done.

---

Implement change request CR-0006 in `changes/CR-0006/`. Read `CR-0006.md` first, then `AGENTS.md`.

1. Apply "Changes to apply to the documents" (spec v9, plan v9, mocks README). Copy `tasks/R11.md` to `tasks/` and add `features/scenarios.feature`. Commit.
2. Implement R11 with failing scenarios first, then make them pass. Keep `npm run verify` green and commit as `R11: Edit acceptance scenarios in the Spec`.
3. Do not delete files without asking. Stop and ask if something conflicts with the code as built.
4. When done, check the "Done when" list in CR-0006.md and report each item.
