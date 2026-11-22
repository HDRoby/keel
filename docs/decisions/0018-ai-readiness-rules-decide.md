---
id: ADR-0018
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-22
change: CR-0015
---

# AI readiness: rules decide, the model explains

## Decision

The AI readiness report (REQ-016) rates a folder with local rules (`src/lib/readiness/rules.ts`): each rule passes, fails or does not apply, with the paths it is based on, and the ratings come from the rules. The model, the Feasibility review model, explains the failed rules for this project, puts the advice in order, and reviews only the AI files the user ticks. Its findings are kept only when their evidence names a path in the scan (and a line within the file); it can lower a rating with evidence, never raise one. The report runs only when the user asks.

## Reason

Rules alone give generic advice. A model alone invents files and gives generic advice too, especially a small local one, and its ratings vary by model. Rules make the result testable and the same on every machine; the model adds the "why it matters here" and reads what the user chooses to share.

## Alternatives considered

- Model only: ungrounded, varies by model, and needs the files' content to say anything.
- Rules only: no project-specific why and no review of the content of AI files.
- A fourth model task for the report: the Feasibility review model already reviews against standards; the owner can split it later.

## Consequences

- Rules may read files locally; only names, rule results and ticked files are sent.
- Secret checks (SA-02) report the file and the field name, never the value.
- If the model fails, the report still shows the rule results.
