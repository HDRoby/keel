Feature: Model providers

  @REQ-009
  Scenario: Switching provider keeps the brainstorm working
    Given the brainstorm uses provider "Anthropic"
    When I switch the brainstorm model to provider "OpenAI" in Settings
    And I send a message in the brainstorm
    Then I get a reply from the new provider
