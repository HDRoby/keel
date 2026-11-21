import { describe, expect, it } from 'vitest';
import { appendToSection, fillSections, isCaptured, nextQuestion, parseSections, requiredCaptured } from './sections';

const template = `---
template: t@1
kind: intent
---

# Intent: {{title}}

## Problem
<!-- required · Who is affected. -->

## Outcome
<!-- required -->

## Notes
<!-- optional · Anything else. -->
`;

describe('sections', () => {
  it('reads headings, required markers and guidance', () => {
    expect(parseSections(template)).toEqual([
      { heading: 'Problem', required: true, guidance: 'Who is affected.' },
      { heading: 'Outcome', required: true, guidance: '' },
      { heading: 'Notes', required: false, guidance: 'Anything else.' },
    ]);
  });

  it('asks each section, probes it once, then moves to the next missing required section', () => {
    const sections = parseSections(template);
    expect(nextQuestion(sections, {})).toEqual({ section: 'Problem', step: 'ask' });
    expect(nextQuestion(sections, { Problem: ['x'] }, { section: 'Problem', step: 'ask' })).toEqual({ section: 'Problem', step: 'probe' });
    expect(nextQuestion(sections, { Problem: ['x', 'y'] }, { section: 'Problem', step: 'probe' })).toEqual({ section: 'Outcome', step: 'ask' });
    expect(nextQuestion(sections, { Problem: ['x'], Outcome: ['y'] })).toEqual({ section: 'Notes', step: 'ask' });
    expect(nextQuestion(sections, { Problem: ['x'], Outcome: ['y'], Notes: ['z'] })).toBeUndefined();
  });

  it('counts a section as captured once it has a non-empty answer', () => {
    const sections = parseSections(template);
    expect(isCaptured({ Problem: [' '] }, 'Problem')).toBe(false);
    expect(requiredCaptured(sections, { Problem: ['x'] })).toBe(false);
    expect(requiredCaptured(sections, { Problem: ['x'], Outcome: ['y'] })).toBe(true);
  });

  it('puts answers under their headings and keeps guidance where nothing was answered', () => {
    const body = '# Intent: K\n\n## Problem\n<!-- required · Who. -->\n- REQ-001 …\n\n## Notes\n<!-- optional -->\n';
    expect(fillSections(body, { Problem: ['First.', 'Second.'] })).toBe(
      '# Intent: K\n\n## Problem\n\nFirst.\n\nSecond.\n\n## Notes\n<!-- optional -->\n',
    );
  });
});

describe('appendToSection', () => {
  const body = '# T\n\n## A\n\nOne.\n\n## B\n<!-- optional · Guide. -->\n\n## C\n\nLast.\n';

  it('adds text at the end of a section and keeps the others', () => {
    expect(appendToSection(body, 'A', 'Two.')).toBe('# T\n\n## A\n\nOne.\n\nTwo.\n\n## B\n<!-- optional · Guide. -->\n\n## C\n\nLast.\n');
    expect(appendToSection(body, 'C', 'More.')).toBe('# T\n\n## A\n\nOne.\n\n## B\n<!-- optional · Guide. -->\n\n## C\n\nLast.\n\nMore.\n');
  });

  it('replaces a lone guidance comment, and adds a missing section at the end', () => {
    expect(appendToSection(body, 'B', 'Now set.')).toBe('# T\n\n## A\n\nOne.\n\n## B\n\nNow set.\n\n## C\n\nLast.\n');
    expect(appendToSection('# T\n', 'New (x)', 'Hi.')).toBe('# T\n\n## New (x)\n\nHi.\n');
  });
});
