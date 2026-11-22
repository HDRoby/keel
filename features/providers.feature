Feature: Model providers

  @REQ-009
  Scenario: Switching provider keeps the brainstorm working
    Given the brainstorm uses provider "Anthropic"
    When I switch the brainstorm model to provider "OpenAI" in Settings
    And I send a message in the brainstorm
    Then I get a reply from the new provider

  @REQ-009
  Scenario: Ollama is the default provider
    Given a user with no saved settings
    When I open Settings
    Then the provider is "Ollama (on this computer)"
    And no API key is asked for

  @REQ-009
  Scenario: The models on this computer are listed
    Given Ollama is running with the models "qwen3:32b" and "gemma3:12b"
    When I open Settings
    Then both models are listed with their size and parameters
    And "Spec and plan" uses "qwen3:32b"

  @REQ-009
  Scenario: Keel says when Ollama is not running
    Given Ollama is not running
    When I open Settings
    Then I see "Ollama is not running" and how to start it
    And actions that need a model say why they are unavailable
