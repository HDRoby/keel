# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0012 is done.

---

Implement change request CR-0013 in `changes/CR-0013/`. Read `CR-0013.md` first, then `AGENTS.md` and `docs/ui-guide.md`.

1. Apply the documents: add REQ-015 and the REQ-003 and REQ-014 changes to `docs/spec.md`, add task R19 to `docs/plan.md`, and record ADR-0015 as described under Decisions. Copy `tasks/R19.md` to `tasks/` and `features/change-packages.feature` to `features/`. Commit.
2. Implement R19 step by step (its Steps section), with failing scenarios first. Keep `npm run verify` green and commit each step as `R19: <step>`.
3. Do not delete files without asking. Never write keys or secrets. Stop and ask if something conflicts with the code as built.
4. When done, run the CR-0011 comparison scenario, report how the generated package differs from `changes/CR-0011/`, then check the "Done when" list and report each item. Write the "As built" section in R19.
