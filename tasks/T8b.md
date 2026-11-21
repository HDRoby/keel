---
id: T8b
plan: PLN-0001@6
requirements: [REQ-006]
status: done
---

# T8b · GitHub push

## Goal

Push the generated package to a new or existing GitHub repository.

## Scenarios that prove it

- `features/handoff.feature` › The scaffold contains the documents and failing stubs (@REQ-006)

## Files that are likely to change

- `src/lib/github/auth.ts`
- `src/lib/github/push.ts`

## Notes

- Fine-grained personal access token or OAuth device flow; least privilege (contents read and write on one repository).
- Tests use a local bare git repository instead of GitHub.
- As built:
  - Token: a fine-grained personal access token in Settings › GitHub, stored encrypted like the model keys. The page asks for **Contents: read and write** on the one repository, nothing more (`src/lib/github/auth.ts`).
  - Push (`src/lib/github/push.ts`): Keel keeps a working copy in `KEEL_HOME/handoffs/<slug>`.
    - It fetches the branch if it exists, writes the package files over it, commits as Keel ("Keel: handoff from PLN-0001@N") and pushes.
    - Files the package does not contain, such as the agent's code, stay.
  - Token handling: the token reaches git as an Authorization header for github.com through the environment of that one command. It is never written to a git config, a remote URL, a document or a log, and git errors are cleaned before they are shown. Git gets only PATH and HOME, and never prompts.
  - Each push is recorded under `repository` in project.md (location, branch, pushes with commit and plan version), so read-back (T9) knows Keel's commits.
  - Destination card on the Handoff page (as in handoff.png): target, repository (owner/name), branch, Push or Push again, and the last push.
    - Pushing again is refused while read-back changes are pending, so an unreviewed agent change is never overwritten.
  - Tests: unit tests push to local bare repositories, including an agent commit between two pushes. Local targets are only accepted with `KEEL_ALLOW_LOCAL_REMOTES=1` (set for the BDD server). The GitHub path is unit-tested up to git receiving the header; a push to real GitHub has not been run here.
  - The secret scan of the package also checks for the stored GitHub token.
- Fixed after the final verification: pushing a package the repository already has makes no commit, adds no push record, and says "Nothing new to push".

## Questions for the owner

Answered by the owner on 2026-11-20:

1. New repositories: no. Keel pushes to an existing (possibly empty) repository.
2. OAuth device flow: no. Personal access token only for v0.1.
