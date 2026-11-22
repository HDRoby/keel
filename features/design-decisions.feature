Feature: Design decisions in the Spec

  @REQ-013
  Scenario: Each design topic offers options with one recommended
    Given an approved intent and the TypeScript conventions standard
    When the spec is generated
    Then the Design tab shows a card for each topic of the spec template
    And each card offers at most three options with one marked "Recommended"
    And an option that breaks TypeScript conventions says so

  @REQ-013
  Scenario: Existing code is offered as "Keep current"
    Given the folder has a package.json with Next.js
    When the spec is generated
    Then the first option for "Language and framework" is "Keep current"

  @REQ-013
  Scenario: Deciding writes a decision record
    Given the "Testing" topic is not decided
    When I pick "Vitest, Playwright and playwright-bdd" and decide
    Then docs/decisions has a new record for Testing
    And the record lists the other options as alternatives considered

  @REQ-013
  Scenario: Changing a decision in a draft spec rewrites its record
    Given the spec is a draft and "Storage" is decided as ADR-0007
    When I change it to "SQLite only"
    Then ADR-0007 records the new choice and the previous one

  @REQ-013 @REQ-005
  Scenario: The plan needs every topic decided
    Given the decision is Go and every requirement has a scenario
    And "Model access" is not decided
    When I open the Plan stage
    Then the stage is locked
    And the message names "Model access"
