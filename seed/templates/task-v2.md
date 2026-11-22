---
template: task@2
kind: task
template_version: 2
fields:
  id: automatic (T1, T2, … for the plan; R1, R2, … for change requests, continuing from the highest R number)
  plan: "automatic (plan version), or change: automatic (CR-NNNN)"
  requirements: automatic
  status: agent (todo, doing, done)
---

# {{task_id}} · {{title}}

## Goal
<!-- required · What is true when the task is done, in one or two sentences. -->

## Scenarios that prove it
<!-- required · list · Feature files and scenario names, tagged with REQ IDs. -->

## Data
<!-- optional · Shapes this task adds or changes (fields, files, headers). -->

## Files that are likely to change
<!-- optional · list · Real paths from the code map when it is on; new files marked "(new)". Otherwise: "To be decided by the coding agent." -->

## Steps
<!-- optional · list · Small steps for bigger tasks, each its own commit. -->

## Notes
<!-- optional · Rules, limits and owner decisions that apply. -->

## Questions for the owner
<!-- optional · Raised by the coding agent; answered in Keel. -->

## As built
<!-- agent · Written by the coding agent when the task is done: what was built and where, owner decisions taken, anything that differs from this task. -->
