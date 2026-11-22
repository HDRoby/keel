Feature: One project per folder

  Keel opens one folder, the same git repository the coding agent builds in,
  and keeps its config and libraries in .keel/.

  @REQ-012
  Scenario: Opening a folder without .keel offers to initialise it
    Given an empty git repository
    When I open Keel on it
    Then I see the Initialise screen with the folder path
    And there is no Projects page

  @REQ-012
  Scenario: Initialising creates the .keel folder
    Given an empty git repository
    When I initialise it with the title "Expense tracker", the standard intent template and the Coach style
    Then .keel/config.yml has the title "Expense tracker"
    And .keel contains the templates, styles and standards folders
    And .keel/.gitignore ignores the cache folder
    And the last commit is "Keel: Initialise project"

  @REQ-012
  Scenario: A folder that is not a git repository becomes one
    Given an empty folder that is not a git repository
    When I initialise it
    Then the folder is a git repository

  @REQ-012
  Scenario: Opening an initialised folder goes to the current stage
    Given a folder initialised by Keel with an approved intent
    When I open Keel on it
    Then I see the Spec stage

  @REQ-009 @REQ-012
  Scenario: Keel never writes keys into the project folder
    Given an initialised folder
    When I save an Anthropic API key in Settings
    Then no file in the project folder contains the key
    And the key is stored in the user config folder

  @REQ-012
  Scenario: Keel commits only its own files
    Given an initialised folder
    And I have staged a change to "src/app.ts"
    When I save the intent
    Then the Keel commit contains only docs/intent.md
    And "src/app.ts" is still staged

  @REQ-012
  Scenario: Initialising a folder that already has Keel documents adopts them
    Given a git repository with a docs/intent.md that has a Keel header
    When I initialise it and choose Adopt
    Then the intent is shown with its existing version
    And .keel/config.yml has the intent's project id
