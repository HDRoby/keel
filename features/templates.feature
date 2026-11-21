Feature: Templates

  @REQ-003
  Scenario: A template used by a project cannot be removed
    Given the template "Standard intent v3" is used by 1 project
    When I open it in the template library
    Then I cannot remove it
    And I see which projects use it
