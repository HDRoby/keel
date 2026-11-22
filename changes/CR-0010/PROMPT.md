# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0009 is done.

---

Implement change request CR-0010 in `changes/CR-0010/`. Read `CR-0010.md` first, then `AGENTS.md` and `docs/ui-guide.md`.

1. Apply "Changes to apply to the documents" (spec v12, plan v13, opening-a-folder.feature). Copy `tasks/R15.md` to `tasks/`. Commit.
2. Implement R15 with failing scenarios first (fixture folders, fake provider), then make them pass. Keep `npm run verify` green and commit as `R15: Opening a folder, four cases`.
3. Do not delete files without asking. Stop and ask if something conflicts with the code as built.
4. When done, check the "Done when" list in CR-0010.md and report each item.
