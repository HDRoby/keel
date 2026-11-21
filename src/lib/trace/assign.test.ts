import { describe, expect, it } from 'vitest';
import { formatReqId, renderRequirements, requirementCandidates, unassigned } from './assign';

describe('requirement IDs', () => {
  it('takes list items from any answer, or the lines of a first answer without a list', () => {
    expect(requirementCandidates(['Generate a README\nDetect  the language', 'We asked two teams.'])).toEqual(['Generate a README', 'Detect the language']);
    expect(requirementCandidates(['Intro\n- One\n- Two', 'Context\n- Three'])).toEqual(['One', 'Two', 'Three']);
  });

  it('skips statements that already have an ID', () => {
    expect(unassigned(['A', 'B', 'REQ-007 C'], { A: 'REQ-001' })).toEqual(['B']);
  });

  it('writes statements with their IDs and leaves other text alone', () => {
    expect(renderRequirements(['- One\n- REQ-009 Typed', 'Why: teams asked.'], { One: 'REQ-001' })).toEqual(['- REQ-001 One\n- REQ-009 Typed', 'Why: teams asked.']);
    expect(renderRequirements(['New one'], {})).toEqual(['New one']);
    expect(formatReqId(7)).toBe('REQ-007');
    expect(formatReqId(1234)).toBe('REQ-1234');
  });
});
