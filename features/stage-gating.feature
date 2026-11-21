Feature: Stage gating

  @REQ-005
  Scenario: Spec is locked until the intent is approved
    Given a project whose intent is still a draft
    When I open the Spec stage
    Then the stage is locked
    And I see "Needs an approved intent"

  @REQ-005
  Scenario: Approving the intent unlocks the spec
    Given a project whose intent is a draft
    When I approve the intent
    Then the Spec stage is available
