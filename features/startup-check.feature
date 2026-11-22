Feature: Startup check

  @REQ-009
  Scenario: First run opens setup first
    Given there is no ~/.config/keel/settings.json
    When I start Keel
    Then I see "Set up Keel first"
    And only Startup check and Settings are available

  @REQ-009 @REQ-005
  Scenario: Keel opens in setup mode when the model cannot be reached
    Given my provider is Ollama
    And Ollama is not running
    When I start Keel
    Then the terminal says "Keel opens in setup mode"
    And the Startup check says Keel could not reach Ollama
    And opening the Spec page takes me back to the Startup check

  @REQ-009
  Scenario: A task without an available model is reported
    Given "Spec and plan" is set to a model that is not installed
    When I start Keel
    Then the Startup check names "Spec and plan" and the missing model

  @REQ-012
  Scenario: An invalid project config keeps the project closed
    Given .keel/config.yml names a template version that is not in .keel/templates
    When I start Keel
    Then the Startup check shows the line that is wrong
    And Project setup and Settings are the only pages available
    And .keel/config.yml is unchanged

  @REQ-009 @REQ-012
  Scenario: When everything is fine Keel opens the project directly
    Given valid settings, a running provider and a valid project config
    When I start Keel
    Then the terminal prints one "Startup check" line
    And I see the current stage of the project
