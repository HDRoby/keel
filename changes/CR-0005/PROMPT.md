# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0004 is done.

---

Implement change request CR-0005 in `changes/CR-0005/`. Read `CR-0005.md` first, then `AGENTS.md`.

1. Apply "Changes to apply to the documents" (spec v8, plan v8, mocks README). Copy `tasks/R10.md` to `tasks/` and replace `features/brainstorm.feature`. Commit.
2. Implement R10 with failing scenarios first (use the fake provider), then make them pass. Keep `npm run verify` green and commit as `R10: Sections with live comments`.
3. Do not delete files without asking. Stop and ask if something conflicts with the code as built.
4. When done, check the "Done when" list in CR-0005.md and report each item.
