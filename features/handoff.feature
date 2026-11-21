Feature: Handoff

  @REQ-006
  Scenario: The scaffold contains the documents and failing stubs
    Given a project with an approved plan
    When I generate the handoff package
    Then it contains AGENTS.md, docs/intent.md, docs/spec.md and docs/plan.md
    And every scenario in it has a failing step stub
    And it contains no API keys or tokens
