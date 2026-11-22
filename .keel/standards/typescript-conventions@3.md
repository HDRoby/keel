---
name: typescript-conventions
description: Apply when creating or changing TypeScript code.
owner: Platform team
version: 3
applies_to: [plan, code]
---

# TypeScript conventions

## Rules

- Strict mode on; no implicit any
- One module per file; named exports only
- Errors are typed results, not thrown strings, at module boundaries
- Every public function has a unit test next to it

Lint: npm run lint (zero warnings). Types: npm run typecheck.
