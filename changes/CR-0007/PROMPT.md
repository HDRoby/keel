# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0006 is done.

---

Implement change request CR-0007 in `changes/CR-0007/`. Read `CR-0007.md` first, then `AGENTS.md`.

1. Apply "Changes to apply to the documents" (spec v10, plan v10, roadmap, mocks README). Copy `tasks/R12.md` to `tasks/` and add `features/design-decisions.feature`. Commit.
2. Implement R12 with failing scenarios first (fake provider for the options), then make them pass. Keep `npm run verify` green and commit as `R12: Design as decisions`.
3. Do not delete files without asking. Stop and ask if something conflicts with the code as built.
4. When done, check the "Done when" list in CR-0007.md and report each item.
