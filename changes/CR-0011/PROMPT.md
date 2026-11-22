# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0010 is done.

---

Implement change request CR-0011 in `changes/CR-0011/`. Read `CR-0011.md` first, then `AGENTS.md` and `docs/ui-guide.md`.

1. Apply "Changes to apply to the documents" (spec v13, plan v14, providers.feature). Copy `tasks/R16.md` to `tasks/`. Commit.
2. Implement R16 with failing scenarios first (fake Ollama stub), then make them pass. Keep `npm run verify` green and commit as `R16: Ollama as the default provider`.
3. Do not delete files without asking. Stop and ask if something conflicts with the code as built.
4. When done, check the "Done when" list in CR-0011.md and report each item.
