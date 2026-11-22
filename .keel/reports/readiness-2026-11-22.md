---
template: readiness-report@1
id: readiness-2026-11-22
title: keel
date: '2026-11-22T22:20:36.061Z'
folder_case: existing-ai
model: 'Ollama (on this computer) · qwen2.5vl:7b'
duration_ms: 87775
read:
  - AGENTS.md
  - CLAUDE.md
areas:
  - area: Agent instructions
    rating: Ready
    summary: Every check passes
    evidence:
      - path: AGENTS.md
      - path: CLAUDE.md
      - path: AGENTS.md
      - path: CLAUDE.md
    source: Scan
  - area: Project knowledge
    rating: Ready
    summary: Every check passes
    evidence:
      - path: README.md
        line: 37
      - path: docs/intent.md
      - path: docs/spec.md
      - path: docs/decisions/
    source: Scan
  - area: Verification
    rating: Partly
    summary: Incomplete test suite
    evidence:
      - path: src/cli/keel-command.test.ts
      - path: src/components/markdown.test.ts
      - path: src/lib/brainstorm/review.test.ts
    source: Model review
  - area: Conventions
    rating: Ready
    summary: Every check passes
    evidence:
      - path: eslint.config.mjs
      - path: .claude/skills/
    source: Scan
  - area: Agent tooling
    rating: Ready
    summary: Every check passes
    evidence:
      - path: .claude/agents/verifier.md
    source: Scan
  - area: Safety
    rating: Missing
    summary: >-
      Add .env*.local, *.pem, *.key to .gitignore; Remove the key from
      features/fixtures/folders/existing-ai/.cursor/mcp.json, move it to an
      environment variable and rotate it
    evidence:
      - path: .gitignore
      - path: features/fixtures/folders/existing-ai/.cursor/mcp.json
    source: Scan
mapping:
  - file: AGENTS.md
    keel: AGENTS.md
    proposal: Keep
    note: >-
      Keel adds its instructions between keel:start and keel:end markers at
      handoff; your text stays.
  - file: CLAUDE.md
    keel: Points to AGENTS.md
    proposal: Keep
    note: Already points to AGENTS.md.
  - file: .claude/agents/
    keel: Agent kit
    proposal: Keep
    note: >-
      Subagents with the same name as Keel's become handoff choices; the others
      stay.
  - file: .claude/skills/
    keel: Standards as skills
    proposal: Keep
    note: Keel writes its standards next to yours.
advice:
  - id: SA-01
    title: 'Add .env*.local, *.pem, *.key to .gitignore'
    area: Safety
    why: >-
      Keys in .env files and certificates are committed by accident when git
      does not ignore them.
    evidence:
      - path: .gitignore
    impact: High
    effort: Small
    source: Scan
    rule: SA-01
    action: add
    choice: add
  - id: SA-02
    title: >-
      Remove the key from
      features/fixtures/folders/existing-ai/.cursor/mcp.json, move it to an
      environment variable and rotate it
    area: Safety
    why: >-
      A key in a tracked file is readable by anyone with the repository, and by
      every agent that reads the folder.
    evidence:
      - path: features/fixtures/folders/existing-ai/.cursor/mcp.json
    impact: High
    effort: Small
    source: Scan
    rule: SA-02
    action: add
    choice: add
  - id: M-0667e20f
    title: Add Test Runner
    area: Verification
    why: >-
      Having a test runner in place helps cover the testing aspect more
      comprehensively.
    evidence:
      - path: src/cli/keel-command.test.ts
      - path: .github/workflows/ci.yml
    impact: High
    effort: Medium
    source: Model review
    action: adopt
    choice: adopt
  - id: M-f3891748
    title: Add CI Test Running
    area: Verification
    why: >-
      Running tests in a Continuous Integration system provides an automated way
      to ensure code changes are not breaking the project.
    evidence:
      - path: .github/workflows/ci.yml
      - path: src/components/markdown.test.ts
    impact: High
    effort: Medium
    source: Model review
    action: adopt
    choice: adopt
  - id: M-9ccdf004
    title: Implement Acceptance Scenarios
    area: Verification
    why: >-
      Adding acceptance scenarios ensures that requirements are met and the
      system's functionality is validated.
    evidence:
      - path: features/ai-readiness.feature
    impact: High
    effort: Medium
    source: Model review
    action: adopt
    choice: adopt
  - id: M-e3a3a005
    title: Verify Task Commands
    area: Agent instructions
    why: >-
      Ensure all commands in AGENTS.md and CLAIDE.md are up-to-date to reflect
      current task requirements.
    evidence:
      - path: .github/workflows/ci.yml
    impact: Medium
    effort: Small
    source: Model review
    action: adopt
    choice: adopt
  - id: M-20369c68
    title: Keep Commands in Sync with Plan
    area: Agent instructions
    why: Match commands to the current stages outlined in `docs/plan.md`.
    evidence:
      - path: ./package.json
    impact: Medium
    effort: Small
    source: Model review
    action: adopt
    choice: adopt
  - id: M-438ccc36
    title: Review Subagents' Roles
    area: Agent instructions
    why: >-
      Ensure all subagents (code-simplifier, researcher, verifier) have correct
      roles in each task to maintain a robust workflow.
    evidence:
      - path: ./.claude/agents/code-simplifier.md
      - path: ./.claude/skills/security-baseline/SKILL.md
    impact: Medium
    effort: Small
    source: Model review
    action: adopt
    choice: adopt
  - id: M-468eb6e1
    title: Document AI Integration
    area: Project knowledge
    why: >-
      Adding a section详述ing on how to utilize AI within this project or any
      integration points is crucial for new contributors. Without clear
      documentation, the AI might not be implemented correctly.
    evidence:
      - path: README.md
        line: 23
    impact: Medium
    effort: Small
    source: Model review
    action: add
    choice: add
hidden: []
model_error: 'the model''s answer was not in the expected format, twice'
handed_over: true
---
# AI readiness report: keel

<!-- Front matter written by Keel: id, date, folder_case, model, duration_ms, read (names only), ratings, advice choices. Never file contents or secret values. -->

## Summary
4 ready · 1 partly · 1 missing. 9 pieces of advice, 5 high impact.

## Areas

| Area | Rating | Finding | Based on | Source |
| --- | --- | --- | --- | --- |
| Agent instructions | Ready | Every check passes | `AGENTS.md`, `CLAUDE.md`, `AGENTS.md`, `CLAUDE.md` | Scan |
| Project knowledge | Ready | Every check passes | `README.md:37`, `docs/intent.md`, `docs/spec.md`, `docs/decisions/` | Scan |
| Verification | Partly | Incomplete test suite | `src/cli/keel-command.test.ts`, `src/components/markdown.test.ts`, `src/lib/brainstorm/review.test.ts` | Model review |
| Conventions | Ready | Every check passes | `eslint.config.mjs`, `.claude/skills/` | Scan |
| Agent tooling | Ready | Every check passes | `.claude/agents/verifier.md` | Scan |
| Safety | Missing | Add .env*.local, *.pem, *.key to .gitignore; Remove the key from features/fixtures/folders/existing-ai/.cursor/mcp.json, move it to an environment variable and rotate it | `.gitignore`, `features/fixtures/folders/existing-ai/.cursor/mcp.json` | Scan |

## Your AI files and the Keel standard

| Your file | Keel | Proposal | Note |
| --- | --- | --- | --- |
| `AGENTS.md` | AGENTS.md | Keep | Keel adds its instructions between keel:start and keel:end markers at handoff; your text stays. |
| `CLAUDE.md` | Points to AGENTS.md | Keep | Already points to AGENTS.md. |
| `.claude/agents/` | Agent kit | Keep | Subagents with the same name as Keel's become handoff choices; the others stay. |
| `.claude/skills/` | Standards as skills | Keep | Keel writes its standards next to yours. |

## Advice

1. **Add .env*.local, *.pem, *.key to .gitignore** (Safety; High impact, Small effort; Scan; Add)
   Keys in .env files and certificates are committed by accident when git does not ignore them. Based on: `.gitignore`.
2. **Remove the key from features/fixtures/folders/existing-ai/.cursor/mcp.json, move it to an environment variable and rotate it** (Safety; High impact, Small effort; Scan; Add)
   A key in a tracked file is readable by anyone with the repository, and by every agent that reads the folder. Based on: `features/fixtures/folders/existing-ai/.cursor/mcp.json`.
3. **Add Test Runner** (Verification; High impact, Medium effort; Model review; Adopt)
   Having a test runner in place helps cover the testing aspect more comprehensively. Based on: `src/cli/keel-command.test.ts`, `.github/workflows/ci.yml`.
4. **Add CI Test Running** (Verification; High impact, Medium effort; Model review; Adopt)
   Running tests in a Continuous Integration system provides an automated way to ensure code changes are not breaking the project. Based on: `.github/workflows/ci.yml`, `src/components/markdown.test.ts`.
5. **Implement Acceptance Scenarios** (Verification; High impact, Medium effort; Model review; Adopt)
   Adding acceptance scenarios ensures that requirements are met and the system's functionality is validated. Based on: `features/ai-readiness.feature`.
6. **Verify Task Commands** (Agent instructions; Medium impact, Small effort; Model review; Adopt)
   Ensure all commands in AGENTS.md and CLAIDE.md are up-to-date to reflect current task requirements. Based on: `.github/workflows/ci.yml`.
7. **Keep Commands in Sync with Plan** (Agent instructions; Medium impact, Small effort; Model review; Adopt)
   Match commands to the current stages outlined in `docs/plan.md`. Based on: `./package.json`.
8. **Review Subagents' Roles** (Agent instructions; Medium impact, Small effort; Model review; Adopt)
   Ensure all subagents (code-simplifier, researcher, verifier) have correct roles in each task to maintain a robust workflow. Based on: `./.claude/agents/code-simplifier.md`, `./.claude/skills/security-baseline/SKILL.md`.
9. **Document AI Integration** (Project knowledge; Medium impact, Small effort; Model review; Add)
   Adding a section详述ing on how to utilize AI within this project or any integration points is crucial for new contributors. Without clear documentation, the AI might not be implemented correctly. Based on: `README.md:23`.

## Model review

The model review did not finish: the model's answer was not in the expected format, twice

