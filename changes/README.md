# Change requests to apply

These change requests come from the owner's review of the Keel mockup on 2026-11-22. Apply them **in order**; each one builds on the one before.

| Order | Change request | What it does | Tasks |
| --- | --- | --- | --- |
| 1 | [CR-0004](CR-0004/CR-0004.md) | One project per folder (the code repository), `.keel/` for config and libraries, keys in `~/.config/keel`, handoff into the folder, read-back from local git, Initialise screen | R1 to R9 |
| 2 | [CR-0005](CR-0005/CR-0005.md) | Explore: template sections with live comments from the assistant, Requirements as a section, intent.md assembled without a model call | R10 |
| 3 | [CR-0006](CR-0006/CR-0006.md) | Spec: edit acceptance scenarios, at least one per requirement | R11 |
| 4 | [CR-0007](CR-0007/CR-0007.md) | Spec: design as decisions with options proposed by the assistant | R12 |
| 5 | [CR-0008](CR-0008/CR-0008.md) | Every screen looks like the mockup: UI guide, shared components, guard rails | R13 |
| 6 | [CR-0009](CR-0009/CR-0009.md) | Clickable mock made elsewhere from the spec (prompt pack), attached back as a versioned mock set; gate setting | R14 |

Each folder has the change request, task files, scenarios and a `PROMPT.md` to paste into the coding agent.

## Requirement IDs after all six

| ID | Requirement | Changed by |
| --- | --- | --- |
| REQ-001 | Template sections with live assistant comments | CR-0005 |
| REQ-002 | intent.md assembled from the sections; IDs at draft time; edits after approval become a change request | CR-0005 |
| REQ-004 | At least one scenario per requirement, edited in the Spec | CR-0006 |
| REQ-005 | Plan needs Go, a scenario per requirement, every design topic decided, and (if set) a current clickable mock | CR-0006, CR-0007, CR-0009 |
| REQ-006 | Handoff writes into the folder; push optional | CR-0004 |
| REQ-007 | Read-back from local git, including uncommitted edits | CR-0004 |
| REQ-009 | Keys in the user config folder | CR-0004 |
| REQ-010 | Clickable mock prompt and versioned mock sets | CR-0009 |
| REQ-012 | One project per folder with `.keel/` | CR-0004 (new) |
| REQ-013 | Design as decisions with options | CR-0007 (new) |
| REQ-014 | Reserved for CR-0003 (change requests across stages, Next) | — |

## Run them

Option A, one at a time (recommended): paste `CR-000N/PROMPT.md` into Claude Code, review the result, then go on to the next.

Option B, all in one session:

---

Apply the change requests in `changes/` in the order listed in `changes/README.md`. For each one:

1. Read its `CR-000N.md` and follow its `PROMPT.md`.
2. Finish it completely (documents, tasks, scenarios, `npm run verify` green) before starting the next one.
3. After each change request, write a short report: what changed, the "Done when" checks, anything left open.

Stop and ask me if a change request conflicts with the code as built, or before deleting any file.

---

The clickable mockup they come from: https://claude.ai/artifact/2c9B2cJWe7LErc2QAAAMvP (private to the owner). Its screen sources are copied to `docs/mocks/source/` by CR-0008.
