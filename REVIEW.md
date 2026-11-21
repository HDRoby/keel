---
project: PRJ-0001
---

# Review instructions

## Passes

Run three passes and tag each finding with its pass:

- **Bugs:** logic errors, broken edge cases, regressions
- **Security:** secrets in code or logs, unvalidated input, over-broad tokens (cite Security baseline v2 rule numbers)
- **Compliance:** the change matches `docs/spec.md` and `docs/plan.md`, and its scenarios pass

## What Important means here

Reserve Important for findings that break a requirement, leak a secret or data, or change scope without a change request. Style and naming are nits.

## Cap the nits

Report at most five nits per review; summarise the rest as a count.

## Do not report

Generated files under `.next/`, lockfiles, and anything `npm run lint` already enforces.
