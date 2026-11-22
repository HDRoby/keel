# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0013 is done (it can also run earlier: it touches packaging, not features).

---

Implement change request CR-0014 in `changes/CR-0014/`. Read `CR-0014.md` first, then `AGENTS.md`.

1. Apply "Changes to apply to the documents" in CR-0014.md (spec, ADR-0016, ADR-0017, ADR-0007 superseded, plan). Copy `tasks/R20.md` to `tasks/`. Commit.
2. Implement R20 step by step (its Steps section), starting with step 0: remove SQLite. Keep `npm run verify` green and commit each step as `R20: <step>`.
3. Ask me before choosing a licence and before creating any release tag. Never publish from this machine. Never write the npm token anywhere.
4. Do not delete files without asking. Stop and ask if something conflicts with the code as built.
5. When done, run the pack-and-install smoke test locally, check the "Done when" list in CR-0014.md and report each item. Write the "As built" section in R20.
