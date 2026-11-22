---
name: security-baseline
description: Apply whenever the work stores credentials, calls external services or exposes an endpoint.
owner: Security team
version: 2
applies_to: [spec, plan, code]
---

# Security baseline

## Rules

- Secrets and API keys are never written to code, documents, git or logs
- Store credentials encrypted; read them at runtime
- Tokens get the least privilege the task needs
- Validate all external input and reject unknown fields

Cite the rule number in any finding, for example "Security baseline v2, rule 1".
