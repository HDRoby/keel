Feature: Change requests

  @REQ-014
  Scenario: Hand-written change requests are listed with their status
    Given changes/CR-0004 is approved and 3 of its 9 tasks are done
    And changes/CR-0005 is approved and depends on CR-0003
    And changes/CR-0003 is approved with no tasks done
    When I open the Changes page
    Then CR-0004 is "In progress" with "3 of 9 tasks done"
    And CR-0005 is "Approved · waiting for CR-0003"
    And "Next to apply" is CR-0004

  @REQ-014 @REQ-005
  Scenario: Changing an approved intent raises a change request
    Given the intent is approved
    When I change Desired outcome in Explore and save as a change request
    Then a new folder changes/CR-NNNN exists with its header
    And the change request shows the change to Desired outcome

  @REQ-014
  Scenario: Impact is listed by requirement
    Given an approved spec and plan
    And a change request that changes REQ-003
    When I open the change request
    Then task T2 and its scenario are listed as affected by REQ-003
    And each affected document offers Update, Still valid and Later

  @REQ-005 @REQ-014
  Scenario: Approved changes mark later documents out of date
    Given a significant change request to the intent is approved but not applied
    When I open the Plan stage
    Then the stage bar says "Out of date" with the change request ID
