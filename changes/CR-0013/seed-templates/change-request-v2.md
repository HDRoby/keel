---
template: change-request@2
kind: change
template_version: 2
fields:
  id: automatic (CR-NNNN, next free number in changes/)
  project: automatic
  title: user
  author: automatic
  created: automatic
  status: approval step (draft, waiting, approved, rejected)
  size: automatic (minor, significant)
  affects: automatic (documents and versions)
  requirements: automatic (REQ IDs; new ones marked "(new)")
  depends_on: suggested (open change requests touching the same documents or requirements)
---

# {{cr_id}}: {{title}}

## Why
<!-- required · The problem with things as they are, in plain words. Who asked, and what triggered it. -->

## What changes
<!-- required · The behaviour after the change, as numbered steps a person would see. Name screens, buttons and messages. Say what is removed. -->

## Requirement changes
<!-- required · table · | ID | Change | — one row per requirement added (marked "(new)"), changed or removed, with the new text. -->

## Impact by requirement
<!-- automatic · table · | Area | Requirements | What happens | — documents, tasks, scenarios and mock screens, with Update, Still valid or Later. -->

## Decisions
<!-- optional · Decision records created or superseded by this change, with links. -->

## Done when
<!-- required · list · Checks a person can run to accept the change, including the verify command. -->
