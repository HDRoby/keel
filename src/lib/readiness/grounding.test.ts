import { describe, expect, it } from 'vitest';
import { confirmed, ground } from './grounding';
import type { RuleResult } from './rules';

const files = new Set(['AGENTS.md', 'README.md', 'docs/decisions/0001-stack.md']);
const lines = (path: string) => ({ 'AGENTS.md': 10, 'README.md': 3 } as Record<string, number>)[path];
const results: RuleResult[] = [
  { rule: 'AI-01', area: 'Agent instructions', status: 'pass', evidence: [{ path: 'AGENTS.md' }] },
  { rule: 'AI-03', area: 'Agent instructions', status: 'fail', evidence: [{ path: 'AGENTS.md', line: 4 }] },
];

describe('grounding the model review', () => {
  it('confirms paths and folders in the scan and lines inside the file', () => {
    expect(confirmed({ path: 'AGENTS.md', line: 10 }, files, lines)).toBe(true);
    expect(confirmed({ path: './README.md' }, files, lines)).toBe(true);
    expect(confirmed({ path: 'docs/decisions/' }, files, lines)).toBe(true);
    expect(confirmed({ path: 'AGENTS.md', line: 11 }, files, lines)).toBe(false);
    expect(confirmed({ path: 'docs/does-not-exist.md' }, files, lines)).toBe(false);
    expect(confirmed({ path: 'src/' }, files, lines)).toBe(false);
  });

  it('drops findings and advice the scan cannot confirm, and why texts for rules that did not fail', () => {
    const grounded = ground('Agent instructions', {
      why: [{ rule: 'AI-03', text: 'The verify script was renamed.' }, { rule: 'AI-01', text: 'Invented.' }],
      findings: [{ summary: 'Line 4 names a missing script', evidence: [{ path: 'AGENTS.md', line: 4 }], lowersRating: false }, { summary: 'Beyond the end', evidence: [{ path: 'AGENTS.md', line: 99 }], lowersRating: true }],
      advice: [
        { title: 'Real', why: 'w', evidence: [{ path: 'README.md' }], impact: 'Low', effort: 'Small', action: 'add' },
        { title: 'Made up', why: 'w', evidence: [{ path: 'docs/does-not-exist.md' }], impact: 'High', effort: 'Small', action: 'add' },
        { title: 'No evidence', why: 'w', evidence: [], impact: 'High', effort: 'Small', action: 'add' },
      ],
    }, results, 'Partly', files, lines);
    expect(grounded.answer.why.map((w) => w.rule)).toEqual(['AI-03']);
    expect(grounded.answer.findings.map((f) => f.summary)).toEqual(['Line 4 names a missing script']);
    expect(grounded.answer.advice.map((a) => a.title)).toEqual(['Real']);
    expect(grounded.dropped).toBe(3);
    expect(grounded.rating).toBe('Partly');
  });

  it('lets a confirmed finding lower Ready to Partly, and never raises a rating', () => {
    const lowering = { why: [], advice: [], findings: [{ summary: 'Two files disagree', evidence: [{ path: 'AGENTS.md', line: 2 }], lowersRating: true }] };
    expect(ground('Agent instructions', lowering, results, 'Ready', files, lines).rating).toBe('Partly');
    expect(ground('Agent instructions', lowering, results, 'Missing', files, lines).rating).toBe('Missing');
    const unconfirmed = { why: [], advice: [], findings: [{ summary: 'x', evidence: [{ path: 'nope.md' }], lowersRating: true }] };
    expect(ground('Agent instructions', unconfirmed, results, 'Ready', files, lines).rating).toBe('Ready');
  });
});
