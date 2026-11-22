# Prompt for the coding agent

Paste this into Claude Code from the repository root, **after CR-0005 (R10) is merged and before CR-0006**.

---

Implement change request CR-0003 in `changes/CR-0003/`. Read `CR-0003.md` first, then `AGENTS.md` and `docs/ui-guide.md` if it exists.

1. Apply "Changes to apply to the documents" (intent, spec, plan, roadmap, change-requests.feature). Copy `tasks/R18.md` to `tasks/`. Commit.
2. Implement R18 with failing scenarios first, then make them pass. Use the real `changes/` folder as a test fixture copy (CR-0004 to CR-0012 are good examples). Keep `npm run verify` green and commit as `R18: Change requests across stages`.
3. Do not delete files without asking. Stop and ask if something conflicts with the code as built.
4. When done, check the "Done when" list in CR-0003.md and report each item.
