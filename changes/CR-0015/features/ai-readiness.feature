Feature: AI readiness report

  @REQ-016 @REQ-012
  Scenario: The check runs only when asked
    Given an existing project folder without AI files
    When I open the folder and go through Initialise
    Then no readiness model call is made
    And What Keel found offers "Check AI readiness"

  @REQ-016
  Scenario Outline: The check works in any kind of folder
    Given the fixture folder "<folder>"
    When I run the AI readiness check
    Then the report rates the six areas
    And the advice button reads "<next>"

    Examples:
      | folder      | next                            |
      | new         | Initialise this folder          |
      | existing    | Add to the baseline plan        |
      | existing-ai | Add to the baseline plan        |
      | keel        | Create change request           |

  @REQ-016
  Scenario: Only names and the ticked files are sent
    Given the fixture folder "existing-ai"
    And I untick "CLAUDE.md"
    When I run the AI readiness check
    Then the model receives file and folder names
    And the model receives the content of "AGENTS.md"
    And the model does not receive the content of "CLAUDE.md"

  @REQ-016
  Scenario: Files that may hold keys are never sent
    Given the fixture folder "existing-ai"
    When I open the AI readiness report
    Then ".cursor/mcp.json" cannot be ticked
    When I run the AI readiness check
    Then Safety is rated "Missing" with advice to remove the key from ".cursor/mcp.json"
    And the value "fixture-not-a-key" appears nowhere in the request, the page or the saved report

  @REQ-016
  Scenario: Advice must point at files that exist
    Given the fixture folder "existing"
    And the model suggests advice based on "docs/does-not-exist.md"
    When I run the AI readiness check
    Then that advice is not shown

  @REQ-016
  Scenario: The report still works when the model fails
    Given the fixture folder "existing"
    And the model does not answer
    When I run the AI readiness check
    Then the six areas are rated from the scan
    And I see "The model review did not finish"

  @REQ-016
  Scenario: Agent files that disagree are flagged
    Given the fixture folder "existing-ai"
    When I run the AI readiness check
    Then Agent instructions is rated "Partly"
    And the advice "Make AGENTS.md the single source" is based on ".github/copilot-instructions.md"

  @REQ-016 @REQ-014
  Scenario: Accepted advice in a Keel folder becomes a change request
    Given the fixture folder "keel"
    And I run the AI readiness check
    When I set one advice item to "Ignore"
    And I press "Create change request"
    Then a draft change request is created with one task for each item set to Add or Adopt

  @REQ-016
  Scenario: Reports are saved and compared
    Given an initialised folder with a readiness report from an earlier day
    When I run the AI readiness check
    Then a new report is committed in .keel/reports
    And Earlier reports lists both
    And ignored advice from the earlier report is not shown again
