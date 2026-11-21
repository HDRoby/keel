import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDocument, saveDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { createProject, projectDir } from '../store/workspace';
import { buildTrace } from '../trace/index';
import { bodyAt, compactChanges, documentVersions, lineChanges } from './diff';
import { versionImpact } from './impact';

describe('lineChanges', () => {
  it('marks removed, added and unchanged lines', () => {
    expect(lineChanges('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual([
      { kind: 'same', text: 'a' }, { kind: 'removed', text: 'b' }, { kind: 'added', text: 'B' },
      { kind: 'same', text: 'c' }, { kind: 'added', text: 'd' },
    ]);
  });

  it('keeps a little context around changes and folds the rest', () => {
    const before = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 8', 'LINE 8');
    expect(compactChanges(lineChanges(before, after), 1)).toEqual([
      'gap', { kind: 'same', text: 'line 7' }, { kind: 'removed', text: 'line 8' }, { kind: 'added', text: 'LINE 8' }, { kind: 'same', text: 'line 9' },
    ]);
  });
});

describe('document versions', () => {
  it('lists versions with the reason they were made, and the body at each', async () => {
    const store = tempStore();
    await createProject(store, { slug: 'p', title: 'P', author: 'Ada' });
    await createDocument(store, 'p', { kind: 'plan', title: 'P', body: 'one\n', template: 'implementation-plan@2' });
    await saveDocument(store, 'p', 'docs/plan.md', { reason: 'Add two', body: 'one\ntwo\n' });
    await saveDocument(store, 'p', 'docs/plan.md', { reason: 'Approved by Ada', status: 'approved', sameVersion: true });
    const dir = projectDir('p', store.home);
    const versions = await documentVersions(dir, 'docs/plan.md');
    expect(versions.map((v) => [v.version, v.reason])).toEqual([[1, 'Create plan'], [2, 'Add two']]);
    expect(await bodyAt(dir, 'docs/plan.md', versions[1]!)).toBe('one\ntwo\n');
    expect(await documentVersions(dir, 'docs/spec.md')).toEqual([]);
  });
});

describe('versionImpact', () => {
  it('finds requirements on changed lines or with changed statements, and what they reach', async () => {
    const store = tempStore();
    await createProject(store, { slug: 'p', title: 'P', author: 'Ada' });
    await createDocument(store, 'p', { kind: 'task', title: 'T', body: '# T1 · T\n', template: 'task@1', extra: { requirements: ['REQ-003'] } });
    const dir = projectDir('p', store.home);
    mkdirSync(join(dir, 'features'));
    writeFileSync(join(dir, 'features/a.feature'), 'Feature: A\n  @REQ-001\n  Scenario: S\n');
    const before = '- REQ-001 Old wording\n| T1 | x | REQ-003 |\n| T2 | y | REQ-009 |\n';
    const after = '- REQ-001 New wording\n| T1 | x changed | REQ-003 |\n| T2 | y | REQ-009 |\n';
    const result = versionImpact(before, after, lineChanges(before, after), buildTrace(dir));
    expect(result.requirements).toEqual(['REQ-001', 'REQ-003']);
    expect(result.impact.tasks.map((t) => t.id)).toEqual(['T1']);
    expect(result.impact.scenarios.map((s) => s.label)).toEqual(['features/a.feature › S']);
  });
});
