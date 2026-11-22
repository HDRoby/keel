# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0015 is done (it needs the CR-0013 package writer and reuses the CR-0015 secret patterns).

---

Implement change request CR-0016 in `changes/CR-0016/`. Read `CR-0016.md` first, then `AGENTS.md` and `docs/ui-guide.md`.

1. Apply "Changes to apply to the documents" in CR-0016.md (intent, spec, ADR-0019, plan, the seed style and template, the mock source). Copy `tasks/R22.md` to `tasks/` and `features/discuss-a-change.feature` to `features/`. Commit as `CR-0016: documents, task R22 and scenarios`.
2. Implement R22 step by step (its Steps section). Keep `npm run verify` green and commit each step as `R22: <step>`.
3. Build the screen with the shared components; `mock-source/discuss.html` is the reference for layout and wording, not for markup.
4. Only the user's Agree creates files. The model never chooses IDs. Never send sources the user did not tick or files they did not attach; never send or save a message that looks like a key.
5. Do not delete files without asking. Stop and ask if something conflicts with the code as built.
6. When done, check the "Done when" list in CR-0016.md and report each item. Write the "As built" section in R22, remove "(coming: CR-0016)" from `docs/user-guide.md`, and update the Status sections of the root `README.md` and `changes/README.md`.
