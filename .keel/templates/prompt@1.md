---
template: prompt@1
kind: change-prompt
template_version: 1
fields:
  cr_id: automatic
  after: automatic (the change request this one depends on, or "the previous change request")
  task_ids: automatic
  verify_command: from AGENTS.md › Commands
  ui_guide: automatic (", then docs/ui-guide.md" when a task touches screens)
---

# Prompt for the coding agent

Paste this into your coding agent from the repository root, after {{after}} is done.

---

Implement change request {{cr_id}} in `changes/{{cr_id}}/`. Read `{{cr_id}}.md` first, then `AGENTS.md`{{ui_guide}}.

1. The documents it changes are already updated in `docs/`. Copy `changes/{{cr_id}}/tasks/*` to `tasks/` and `changes/{{cr_id}}/features/*` to `features/`. Commit as `{{cr_id}}: tasks and scenarios`.
2. Implement {{task_ids}} in order, with failing scenarios first, then make them pass. Keep `{{verify_command}}` green after each task and commit each one as `<task ID>: <task title>`.
3. Do not delete files without asking. Never write keys, tokens or secrets to files, documents, git or logs. Stop and ask if something in {{cr_id}} conflicts with the code as built. Do not change behaviour beyond the change request.
4. When a task is done, set its `status: done` and write its "As built" section.
5. When all tasks are done, check the "Done when" list in `{{cr_id}}.md` and report each item.
{{big_change_note}}
