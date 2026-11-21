---
name: bdd-style
description: Apply when writing or changing acceptance scenarios.
owner: Quality team
version: 1
applies_to: [spec, code]
---

# BDD style guide

## Rules

- One behaviour per scenario
- Describe what happens, not which buttons are clicked
- Tag every scenario with its requirement, for example @REQ-005
- Use the words of the intent and spec, not technical names

Coding agents make scenarios pass by changing the code and never edit .feature files to do so.
