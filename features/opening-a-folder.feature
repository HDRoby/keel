Feature: Opening a folder

  @REQ-012
  Scenario: An empty folder starts a new project
    Given an empty folder
    When I open Keel on it
    Then "What Keel found" says it is a new project
    And the main button is "Initialise and start brainstorm"

  @REQ-012
  Scenario: A Keel folder with an old config offers an upgrade
    Given a folder whose .keel/config.yml has format 1
    When I open Keel on it
    Then I am offered to upgrade the config in one Keel commit
    And nothing is changed until I agree

  @REQ-012
  Scenario: An existing project is offered a baseline
    Given a git repository with a package.json and a README
    And no AI agent files
    When I open Keel on it
    Then the recommended path is "Record what exists, then plan the next change"
    And the files the assistant would read are listed with their sizes
    And nothing has been sent to the model

  @REQ-012
  Scenario: Rules in existing agent files are proposed as a standard
    Given a repository with an AGENTS.md that says "Use pnpm, never npm or yarn"
    When I open Keel on it and accept the proposed rules
    Then .keel/standards/project-conventions/SKILL.md contains that rule

  @REQ-006
  Scenario: Handoff keeps the existing AGENTS.md
    Given a repository with my own AGENTS.md
    When I write the handoff
    Then my text in AGENTS.md is unchanged
    And Keel's instructions are inside the keel:start and keel:end markers
