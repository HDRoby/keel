Feature: Traceability

  @REQ-004
  Scenario: A changed requirement shows its impact
    Given REQ-003 is linked to task T2 and to a scenario
    When REQ-003 changes in a new intent version
    Then task T2 and that scenario are listed as affected
