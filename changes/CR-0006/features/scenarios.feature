Feature: Acceptance scenarios in the Spec

  @REQ-004
  Scenario: Scenarios are grouped by requirement
    Given a spec with requirements REQ-001 to REQ-003
    And REQ-002 has no scenario
    When I open the Acceptance scenarios tab
    Then each requirement is listed with its scenarios
    And REQ-002 is marked "No scenario yet"

  @REQ-004
  Scenario: I add a second scenario to a requirement
    Given REQ-001 has one scenario
    When I add a scenario to REQ-001 with a Given, a When and a Then
    Then REQ-001 has two scenarios
    And the Gherkin view tags both with @REQ-001

  @REQ-004
  Scenario: A suggested failure case counts only once accepted
    Given REQ-005 has one scenario
    When I ask for a failure case for REQ-005
    Then a suggested scenario appears under REQ-005
    And REQ-005 still counts one scenario until I accept it

  @REQ-005
  Scenario: The plan needs a scenario for every requirement
    Given the decision is Go
    And REQ-002 has no scenario
    When I open the Plan stage
    Then the stage is locked
    And the message names REQ-002
