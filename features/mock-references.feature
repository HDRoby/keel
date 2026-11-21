Feature: Mock references

  @REQ-010
  Scenario: A mock reference is linked to requirements
    Given an intent with requirements REQ-001 and REQ-002
    When I attach the link "https://example.com/mock" to the intent
    And I link it to REQ-001
    Then the reference lists REQ-001
    And it is saved under docs/mocks/
