Feature: Brainstorm

  @REQ-001
  Scenario: The assistant asks about the next missing required section
    Given a new idea using the "Standard intent v3" template
    And the problem section is already captured
    When I answer the current question
    Then the assistant asks about "Desired outcome"
