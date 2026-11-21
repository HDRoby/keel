Feature: Intent document

  @REQ-002
  Scenario: The intent carries its metadata
    Given a brainstorm with every required section answered
    When I draft intent.md
    Then its header has id, project, author, created, updated, status and version
    And the status is "draft"
