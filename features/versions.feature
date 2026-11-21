Feature: Versions

  @REQ-008
  Scenario: Comparing two versions shows what changed and why
    Given plan versions 3 and 4 exist
    When I select version 4
    Then I see the lines that changed from version 3
    And I see the reason recorded for version 4
