# Prompt for the coding agent

Paste this into Claude Code from the repository root, after CR-0013 is done (CR-0014 can run before or after: it touches packaging, not this feature).

---

Implement change request CR-0015 in `changes/CR-0015/`. Read `CR-0015.md` first, then `AGENTS.md` and `docs/ui-guide.md`.

1. Apply "Changes to apply to the documents" in CR-0015.md (intent, spec, ADR-0018, plan, the seed template, the mock source). Copy `tasks/R21.md` to `tasks/` and `features/ai-readiness.feature` to `features/`. Commit as `CR-0015: documents, task R21 and scenarios`.
2. Implement R21 step by step (its Steps section). Keep `npm run verify` green and commit each step as `R21: <step>`.
3. Build the screen with the shared components; `mock-source/readiness.html` is the reference for layout and wording, not for markup.
4. Never send file contents the user did not tick. Never show, log, send or store a secret value: SA-02 reports the file and the field name only. Use obviously fake values in fixtures.
5. Do not delete files without asking. Stop and ask if something conflicts with the code as built.
6. When done, check the "Done when" list in CR-0015.md and report each item. Write the "As built" section in R21, remove "(coming: CR-0015)" from `docs/user-guide.md`, and update the Status section of the root `README.md` and `changes/README.md`.
