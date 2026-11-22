Feature: Handoff

  @REQ-006
  Scenario: Handoff writes the agent files into the project folder
    Given an initialised folder with an approved plan
    When I write the handoff to the folder
    Then the folder contains AGENTS.md, REVIEW.md and the agent kit
    And every scenario in features/ has a failing step stub
    And no file in the folder contains an API key or token
    And the last commit is a Keel commit with the handoff files

  @REQ-006
  Scenario: Handoff does not overwrite a file Keel did not write
    Given an initialised folder with an approved plan
    And the folder already has an AGENTS.md that Keel did not write
    When I open the Handoff page
    Then AGENTS.md is shown as a conflict
    And writing the handoff leaves my AGENTS.md unchanged until I choose

  @REQ-006
  Scenario: Pushing uses the folder's own remote
    Given an initialised folder with a handoff written
    And the folder has a remote called origin
    When I push from the Handoff page
    Then the remote has the Keel commits
