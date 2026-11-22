Feature: Discuss a change

  @REQ-017
  Scenario: A discussion ends in a proposal card
    Given an initialised folder with an approved intent
    When I start a discussion with "Reviewers should comment on the spec before I approve it"
    And the assistant proposes a change request
    Then I see a "Proposed change request" card with Why, What changes and Requirement changes
    And new requirements, tasks and decisions show "new" instead of an ID

  @REQ-017
  Scenario: Writing yes does not create a change request
    Given a discussion with a proposal waiting
    When I send "yes, go ahead"
    Then no change request is created
    And I see "Typing “yes” creates nothing: use Agree on the proposal"

  @REQ-017 @REQ-014
  Scenario: Agreeing writes the package and keeps the discussion
    Given a discussion with a proposal waiting
    When I press "Agree and create the change request"
    Then a change request is created as a Draft with the next free ID
    And its folder contains the change request, PROMPT.md, the tasks, the scenarios and discussion.md
    And the change request header names the discussion
    And all of it is in one Keel commit

  @REQ-017
  Scenario: The proposal is checked by Keel
    Given the assistant proposes a change to "REQ-099", which does not exist
    When the proposal is shown
    Then the card shows "Unknown requirement REQ-099"
    And "Agree and create the change request" is disabled until I edit it

  @REQ-017
  Scenario: An unreadable proposal is asked for again once
    Given the assistant answers with an invalid proposal twice
    When the proposal is read
    Then the reply is shown as text
    And I see "The proposal could not be read; ask the assistant to propose again"

  @REQ-017
  Scenario: Only the chosen sources are sent
    Given I untick "Plan" in "What the assistant can see"
    When I send a message
    Then the model receives the requirements and the code map as file names
    And the model does not receive the plan

  @REQ-017
  Scenario: A message that looks like a key is never sent or saved
    When I try to send "use sk-test-fixture-0000000000000000"
    Then the message is held with "This looks like a key. Keel will not send or save it."
    And the text appears in no model request and in no discussion file

  @REQ-017
  Scenario: A parked discussion stays for later
    Given a discussion without a proposal
    When I park it
    Then it stays in .keel/discussions as Parked
    And Earlier discussions lists it
