---
name: api-design
description: Apply when designing or changing an HTTP endpoint.
owner: Architecture group
version: 1
applies_to: [spec, code]
---

# API design guidelines

## Rules

- Resource names are plural nouns
- Version in the path: /v1/
- Errors use one JSON shape with code, message and details
- List endpoints are paginated
