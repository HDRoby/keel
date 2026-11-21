Feature: Read-back

  @REQ-007
  Scenario: An agent change to the plan shows up for review
    Given a project pushed to a repository
    When the coding agent commits a change to docs/plan.md
    And Keel checks the repository
    Then the change is shown as pending
    And accepting it creates a new plan version
