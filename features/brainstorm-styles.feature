Feature: Brainstorm styles

  @REQ-011
  Scenario: The chosen style is recorded with the intent
    Given a new idea started with the "Challenger" brainstorm style
    When I draft intent.md
    Then its header records brainstorm_style "challenger@1"
