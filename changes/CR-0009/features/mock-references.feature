Feature: Clickable mock

  @REQ-010
  Scenario: Keel builds a prompt for an external model from the spec
    Given a spec whose Form decision is "Local web app"
    When I open the Clickable mock tab
    Then the prompt lists each screen with its requirement IDs
    And it asks for files named "spec-v<N> · <number> · <screen> · <REQ IDs>"

  @REQ-010
  Scenario: Attached files are matched to screens by name
    Given I drop "spec-v9 · 03 · Explore · REQ-001.png" and "image (3).png"
    Then the first file is matched to Explore and REQ-001
    And "image (3).png" asks me to choose a screen

  @REQ-010
  Scenario: A mock set goes out of date when the spec changes
    Given mock set 1 was made from spec v9
    When the spec gets version 10
    Then mock set 1 is marked "Out of date"

  @REQ-005 @REQ-010
  Scenario: A required mock set locks the plan
    Given the project setting "Clickable mock before the plan" is "Required"
    And the Form decision has a UI
    And there is no current mock set
    When I open the Plan stage
    Then the stage is locked
    And the message says a current clickable mock is needed
