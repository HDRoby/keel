import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conflictNote, joinSections, mergePiece, mergeSections, readBaseline, setSection, splitSections, writeBaseline } from './merge';

const doc = (a: string, b: string) => `# Spec\n\n## A\n\n${a}\n\n## B\n\n${b}\n`;

describe('sections', () => {
  it('splits at ## headings and joins back unchanged', () => {
    const body = doc('One.', 'Two.');
    const parts = splitSections(body);
    expect(parts.head).toBe('# Spec\n\n');
    expect(parts.sections.map((s) => s.heading)).toEqual(['A', 'B']);
    expect(joinSections(parts.head, parts.sections)).toBe(body);
  });

  it('replaces, removes or adds one section', () => {
    expect(setSection(doc('One.', 'Two.'), 'A', 'New.')).toBe('# Spec\n\n## A\n\nNew.\n\n## B\n\nTwo.\n');
    expect(setSection(doc('One.', 'Two.'), 'A', '')).toBe('# Spec\n\n## B\n\nTwo.\n');
    expect(setSection('# Spec\n', 'C', 'Hi.')).toBe('# Spec\n## C\n\nHi.\n');
  });
});

describe('three-way merge', () => {
  it('takes the side that changed, and flags pieces changed on both sides', () => {
    expect(mergePiece('a', 'a', 'b')).toEqual({ value: 'b', conflict: false });
    expect(mergePiece('a', 'm', 'a')).toEqual({ value: 'm', conflict: false });
    expect(mergePiece('a', 'x', 'x ')).toEqual({ value: 'x', conflict: false });
    expect(mergePiece('a', 'm', 't')).toEqual({ value: 'm', conflict: true });
    expect(mergePiece(undefined, undefined, 't')).toEqual({ value: 't', conflict: false });
  });

  it('keeps edits, brings in new text and raises a conflict where both changed', () => {
    const base = doc('Gen A.', 'Gen B.');
    const mine = doc('My A.', 'Gen B.');
    const theirs = doc('New A.', 'New B.');
    const merged = mergeSections(base, mine, theirs);
    expect(merged.body).toBe(doc('My A.', 'New B.'));
    expect(merged.conflicts).toEqual([{ kind: 'section', name: 'A', mine: '\nMy A.\n\n', theirs: '\nNew A.\n\n' }]);
  });

  it('adds sections the generation introduces and respects sections the proposer removed', () => {
    const base = doc('A.', 'B.');
    const mine = '# Spec\n\n## A\n\nA.\n';
    expect(mergeSections(base, mine, doc('A.', 'B.')).body).toBe('# Spec\n\n## A\n\nA.\n');
    const changed = mergeSections(base, mine, doc('A.', 'B changed.'));
    expect(changed.conflicts).toEqual([{ kind: 'section', name: 'B', mine: '', theirs: '\nB changed.\n' }]);
    expect(mergeSections(base, doc('A.', 'B.'), `${doc('A.', 'B.')}\n## C\n\nC.\n`).body).toContain('## C\n\nC.');
  });
});

describe('conflict note', () => {
  it('counts the conflicts left to resolve', () => {
    const conflict = { kind: 'section' as const, name: 'Risks', mine: 'a', theirs: 'b' };
    expect(conflictNote([])).toBe('');
    expect(conflictNote([conflict])).toBe(', 1 conflict to resolve');
    expect(conflictNote([conflict, { ...conflict, name: 'Approach' }])).toBe(', 2 conflicts to resolve');
  });
});

describe('baselines', () => {
  it('stores what Keel generated under .keel/generated and removes it on request', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-base-'));
    expect(writeBaseline(dir, 'docs/spec.md', 'x')).toBe('.keel/generated/docs/spec.md');
    expect(readBaseline(dir, 'docs/spec.md')).toBe('x');
    writeBaseline(dir, 'docs/spec.md', undefined);
    expect(readBaseline(dir, 'docs/spec.md')).toBeUndefined();
  });
});
