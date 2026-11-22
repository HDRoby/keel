---
id: ADR-0015
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-22
change: CR-0013
---

# Change packages are written from templates; planning uses only file names unless the user shares files

## Decision

Keel writes every file of a change package from a versioned template chosen in Settings and Project setup: the request (`change-request@2`), the prompt for the coding agent (`prompt@1`), the tasks (`task@2`) and the changes index (`changes-index@1`). The "Plan the change" step proposes new tasks, files likely to change and scenarios. It reads only file and folder names (the code map) unless the user picks files to share for that request, with their sizes shown first.

## Reason

The hand-written requests CR-0003 to CR-0012 were built with few questions because each had a full description, real tasks with file paths, scenarios and a prompt with working rules. Templates make Keel's own packages as complete. Reading only names by default keeps file contents on the computer unless the user chooses otherwise, as for the baseline (CR-0010).

## Consequences

- The change templates live in `.keel/templates` and the library like the others; a template in use cannot be removed.
- Without a code map, tasks say "To be decided by the coding agent".
- `changes/README.md` is generated from `changes-index@1` unless the project turns it off.
