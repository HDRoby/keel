Feature: Change packages

  @REQ-003 @REQ-015
  Scenario: Change templates are chosen in Settings
    Given an initialised folder
    When I open Settings
    Then "Templates for new documents" offers Task, Change request, Prompt for the coding agent and Changes index
    And the chosen Change request template is used for the next change request

  @REQ-015
  Scenario: Planning a change writes new tasks with likely files
    Given the code map is "File and folder names only"
    And an approved change request "Ollama is the default provider" touching REQ-009
    When I plan the change
    Then at least one new task is proposed with an ID after the highest R number
    And it lists files that are likely to change from the code map
    And at least one scenario for REQ-009 is suggested

  @REQ-015
  Scenario: The package follows the templates
    Given a planned change request with one accepted scenario
    When I write the package
    Then changes/CR-NNNN contains CR-NNNN.md with "Why", "What changes" and "Done when"
    And PROMPT.md tells the agent to commit each task as "<task ID>: <task title>"
    And the task files have an "As built" section

  @REQ-015
  Scenario: The changes index is kept up to date
    Given "Keep changes/README.md up to date" is on
    When I approve a change request
    Then changes/README.md lists it in dependency order with its status

  @REQ-015
  Scenario: Two requests claiming the same new requirement are flagged
    Given two open change requests that both name REQ-016 as new
    When I open the Changes page
    Then both show a requirement ID warning
    And the later one is offered the next free ID
