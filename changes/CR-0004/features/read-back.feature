Feature: Read-back

  @REQ-007
  Scenario: An agent commit to the plan shows up for review
    Given an initialised folder with an approved plan
    When the coding agent commits a change to docs/plan.md
    And Keel checks the folder
    Then the change is shown as pending
    And accepting it creates a new plan version in draft

  @REQ-007
  Scenario: An uncommitted agent edit shows up for review
    Given an initialised folder with an approved plan
    When the coding agent edits tasks/T2.md without committing
    And Keel checks the folder
    Then the change is shown as pending and marked Uncommitted

  @REQ-007
  Scenario: Keel's own commits are not read back
    Given an initialised folder with an approved plan
    When Keel commits a new spec version
    And Keel checks the folder
    Then there are no changes to review
