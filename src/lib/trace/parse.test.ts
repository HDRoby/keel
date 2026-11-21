import { describe, expect, it } from 'vitest';
import { maxReqNumber, parseFeature, parseTask, reqIds, requirementStatements, scenarioLabel } from './parse';

describe('reqIds', () => {
  it('finds IDs once, in order, and the highest number', () => {
    expect(reqIds('REQ-002 and REQ-010, again REQ-002; not REQ-1')).toEqual(['REQ-002', 'REQ-010']);
    expect(maxReqNumber('REQ-002 REQ-010')).toBe(10);
    expect(maxReqNumber('none')).toBe(0);
  });
});

describe('requirementStatements', () => {
  it('reads list items and table rows, first statement wins', () => {
    const text = '- REQ-001 Brainstorm with an LLM\n* REQ-002: Metadata\n| REQ-003 | Templates | Intent |\n| REQ-001 | Other | x |\nSee REQ-009 in prose.';
    expect(requirementStatements(text)).toEqual({ 'REQ-001': 'Brainstorm with an LLM', 'REQ-002': 'Metadata', 'REQ-003': 'Templates' });
  });
});

describe('parseTask', () => {
  it('takes id and requirements from front matter, title from the heading, and the feature files named', () => {
    const task = parseTask('tasks/T2.md', '---\nid: T2\nrequirements: [REQ-003]\n---\n\n# T2 · Template library\n\n- `features/templates.feature` (also REQ-009 in prose)\n');
    expect(task).toEqual({ id: 'T2', title: 'Template library', requirements: ['REQ-003'], features: ['features/templates.feature'] });
  });

  it('falls back to the file name and the IDs in the body', () => {
    expect(parseTask('tasks/T9.md', '# Read-back\nCovers REQ-007.')).toEqual({ id: 'T9', title: 'Read-back', requirements: ['REQ-007'], features: [] });
    expect(parseTask('tasks/T3.md', '---\n: [\n---\nREQ-009').requirements).toEqual(['REQ-009']);
  });
});

describe('parseFeature', () => {
  it('links each scenario to its tags and the feature tags', () => {
    const text = '@REQ-005\nFeature: Gates\n\n  @REQ-001 @smoke\n  Scenario: One\n    Given x\n\n  Scenario Outline: Two\n    Given <y>\n';
    const scenarios = parseFeature('features/gates.feature', text);
    expect(scenarios).toEqual([
      { feature: 'features/gates.feature', scenario: 'One', requirements: ['REQ-005', 'REQ-001'] },
      { feature: 'features/gates.feature', scenario: 'Two', requirements: ['REQ-005'] },
    ]);
    expect(scenarioLabel(scenarios[0] ?? { feature: '', scenario: '' })).toBe('features/gates.feature › One');
  });
});
