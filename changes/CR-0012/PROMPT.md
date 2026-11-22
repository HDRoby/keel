# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0011 is done.

---

Implement change request CR-0012 in `changes/CR-0012/`. Read `CR-0012.md` first, then `AGENTS.md` and `docs/ui-guide.md`.

1. Apply "Changes to apply to the documents" (spec v14, plan v15, startup-check.feature, Startup.dc.html in docs/mocks/source). Copy `tasks/R17.md` to `tasks/`. Commit.
2. Implement R17 with failing scenarios first (fake provider and fake Ollama stub), then make them pass. Keep `npm run verify` green and commit as `R17: Startup check and setup mode`.
3. Do not delete files without asking. Stop and ask if something conflicts with the code as built.
4. When done, check the "Done when" list in CR-0012.md and report each item.
