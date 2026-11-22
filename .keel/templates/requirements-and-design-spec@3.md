---
template: requirements-and-design-spec@3
kind: spec
template_version: 1
fields:
  id: automatic
  project: automatic
  title: user
  author: automatic
  created: automatic
  updated: automatic
  status: approval step (draft, pending, approved, closed)
  version: automatic
  from_intent: automatic
  standards: automatic
  decision: decision step
decision_topics:
  - title: Form
    guidance: What the user runs or opens (web app, desktop app, command-line tool, service).
  - title: Language and framework
    guidance: The programming language and the main framework.
  - title: Storage
    guidance: Where data lives, and what is the source of truth.
  - title: Model access
    guidance: How the product reaches language models, if it does.
  - title: Testing
    guidance: Unit tests, acceptance scenarios and how they run.
---

# Spec: {{title}}

## Requirements
<!-- required · All REQ items, from the intent and new ones, with source. -->

## Design
<!-- automatic · One decision per topic, chosen in the Design tab; each is a decision record in docs/decisions/. -->

## Approach
<!-- automatic · Assembled from the chosen design options. -->

## Standards applied
<!-- automatic · Standards and versions the spec was checked against. -->

## Feasibility review
<!-- required · Architecture fit, integration, security and data, effort, risk, build or buy. -->

## Flagged concerns
<!-- required · Conflicts with standards or missing information, each with an owner. -->

## Acceptance scenarios
<!-- required · Given/When/Then, tagged @REQ-xxx, following the BDD style guide. Saved to features/. -->

## Out of scope
<!-- optional -->
