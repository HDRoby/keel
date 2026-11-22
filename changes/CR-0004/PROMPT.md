# Prompt for the coding agent

Paste this into Claude Code (or any coding agent) from the repository root.

---

Implement change request CR-0004 in `changes/CR-0004/`. Read `CR-0004.md` first, then `AGENTS.md`.

1. **Documents first, one commit.**
   - Move `changes/CR-0004/decisions/*.md` to `docs/decisions/`. Set ADR-0008's status to `superseded by ADR-0012` and add a line to ADR-0007 that the git repository is now the project folder and the index is `.keel/cache/index.db`.
   - Apply "Changes to apply to the documents" in CR-0004.md to `docs/intent.md` (v3), `docs/spec.md` (v7), `docs/plan.md` (v7), `docs/roadmap.md` and `docs/mocks/README.md`. Bump `version` and `updated`, set the status of intent, spec and plan to `approved` (the owner approved CR-0004), and update `from_intent` and `from_spec`.
   - Copy `changes/CR-0004/tasks/R*.md` to `tasks/`.
   - Replace `features/handoff.feature` and `features/read-back.feature`, and add `features/project-folder.feature`, from `changes/CR-0004/features/`.
   - Update `docs/traceability.json` for REQ-012 if it is maintained by hand; otherwise regenerate it.
2. **Then the tasks, in order R1 to R9.** For each task:
   - Make its scenarios fail first (step definitions in `features/steps/`, using `KEEL_PROJECT_DIR` and `KEEL_USER_DIR` pointing at temporary folders), then make them pass.
   - Keep `npm run verify` green at the end of each task and commit each task separately: `R<n>: <title>`.
   - Add an "As built" section to the task file and set its status to `done`.
3. **Rules.**
   - Do not delete files without asking me. If a file must go (for example `src/app/(workspace)/page.tsx`), ask, or move it to `_removed/` and tell me.
   - Never write a key, token or secret to the project folder, a document, git or a log (Security baseline v2).
   - Follow the skills in `.claude/skills/` (small steps, TypeScript conventions, BDD style).
   - Stop and ask if something in CR-0004 conflicts with the code as built.
4. **When done**, check the "Done when" list in CR-0004.md and report each item.
