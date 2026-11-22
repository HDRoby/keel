Feature: Brainstorm

  Explore shows the intent template's sections. The assistant reviews all of
  them together and comments on each one. There are no send buttons.

  @REQ-001
  Scenario: Explore shows the template's sections with a comment on each
    Given an initialised folder using the "Standard intent v4" template
    And I have filled in Problem and Who it is for
    When I open Explore
    Then I see a field for each section of the template
    And each section has a comment from the assistant above it

  @REQ-001
  Scenario: Leaving a changed section triggers one review of all sections
    Given I am editing Who it is for
    When I change its text and move to Desired outcome
    Then the assistant reviews all sections once
    And the comments on other sections are refreshed

  @REQ-001
  Scenario: An unchanged list is not reviewed again
    Given the assistant has reviewed all sections
    When I move between sections without changing anything
    Then no review is made

  @REQ-001
  Scenario: The assistant links sections that conflict
    Given Who it is for mentions product managers
    And Constraints does not mention a web UI
    When the assistant reviews the sections
    Then Constraints has a comment that links it to Who it is for
    And the comment offers a rewrite I can apply

  @REQ-001
  Scenario: The assistant never rewrites my text on its own
    Given I wrote Problem myself
    When the assistant reviews the sections
    Then Problem still has my text
    And any rewrite is only offered in the comment

  @REQ-001 @REQ-005
  Scenario: A suggestion counts only once I accept it
    Given Desired outcome is empty
    When the assistant fills it with a suggestion
    Then Draft intent.md is still disabled
    And accepting the suggestion enables Draft intent.md

  @REQ-001 @REQ-004
  Scenario: Requirements are a section, and IDs are given when drafting
    Given I have accepted three requirement rows in Explore
    When I draft the intent
    Then intent.md lists them as REQ-001, REQ-002 and REQ-003
    And Explore shows those IDs next to the rows
    And a row I add later shows "new" until the next draft

  @REQ-002
  Scenario: intent.md is assembled from the sections without a model call
    Given every required section is filled
    When I draft the intent
    Then intent.md contains each section exactly as I wrote it
    And no model call is made

  @REQ-002 @REQ-005
  Scenario: Editing an approved intent creates a change request
    Given the intent is approved
    When I change Desired outcome in Explore and save
    Then a change request is created with the change to Desired outcome
    And the approved intent is unchanged
