# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0008 is done.

---

Implement change request CR-0009 in `changes/CR-0009/`. Read `CR-0009.md` first, then `AGENTS.md` and `docs/ui-guide.md`.

1. Apply "Changes to apply to the documents" (spec v11, plan v12, mock-references.feature, docs/mocks reorganised into set-1). Copy `tasks/R14.md` to `tasks/`. Commit.
2. Implement R14 with failing scenarios first, then make them pass. Keep `npm run verify` green and commit as `R14: Clickable mock prompt and mock sets`.
3. Do not delete files without asking (moving the mock files is fine). Stop and ask if something conflicts with the code as built.
4. When done, check the "Done when" list in CR-0009.md and report each item.
