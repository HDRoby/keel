import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDocument, saveDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { createProject, projectDir } from '../store/workspace';
import { buildTrace, changedRequirements, impactOf, latestIntentChange, requirementIds, traceabilityJson } from './index';

const REPO = process.cwd();

describe('buildTrace', () => {
  it("reproduces Keel's own docs/traceability.json from its docs, tasks and features", () => {
    const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort().map(([k, x]) => [k, sorted(x)])) : v);
    const expected = JSON.parse(readFileSync(join(REPO, 'docs/traceability.json'), 'utf8'));
    const built = JSON.parse(traceabilityJson(buildTrace(REPO), expected.project, expected.generated));
    expect(sorted(built)).toEqual(sorted(expected));
  });

  it('records statements and their source document', () => {
    expect(buildTrace(REPO).requirements['REQ-004']).toMatchObject({ statement: 'Stable requirement IDs traced from intent to spec, plan and tests', source: 'INT-0001@3', tasks: ['T5'] });
  });

  it('lists the requirement IDs of a project, sorted', () => {
    const ids = requirementIds(REPO);
    expect(ids).toContain('REQ-004');
    expect(ids).toEqual(Object.keys(buildTrace(REPO).requirements).sort());
  });
});

describe('impact', () => {
  it('lists the tasks and scenarios linked to changed requirements', () => {
    const impact = impactOf(buildTrace(REPO), ['REQ-003']);
    expect(impact.tasks.map((t) => t.id)).toEqual(['T1', 'T2']);
    expect(impact.scenarios.map((s) => s.label)).toEqual(['features/templates.feature › A template used by a project cannot be removed']);
  });

  it('tells changed, added and removed requirements apart', () => {
    expect(changedRequirements('- REQ-001 A\n- REQ-002 B\n- REQ-003 C', '- REQ-001 A\n- REQ-002  B changed\n- REQ-004 D')).toEqual({
      changed: ['REQ-002'], added: ['REQ-004'], removed: ['REQ-003'],
    });
  });

  it('compares the last two intent versions in git', async () => {
    const store = tempStore();
    await createProject(store, { slug: 'p', title: 'P', author: 'Ada' });
    expect(await latestIntentChange(projectDir('p', store.home))).toBeUndefined();
    await createDocument(store, 'p', { kind: 'intent', title: 'P', body: '- REQ-001 A\n- REQ-002 B\n', template: 't@1' });
    await createDocument(store, 'p', { kind: 'task', title: 'T', body: '# T1 · T\n', template: 'task@1', extra: { requirements: ['REQ-002'] } });
    mkdirSync(join(projectDir('p', store.home), 'features'));
    writeFileSync(join(projectDir('p', store.home), 'features/b.feature'), 'Feature: B\n  @REQ-002\n  Scenario: S\n');
    await saveDocument(store, 'p', 'docs/intent.md', { reason: 'Change B', body: '- REQ-001 A\n- REQ-002 B2\n' });
    expect(await latestIntentChange(projectDir('p', store.home))).toEqual({
      from: 1, to: 2, changed: ['REQ-002'], added: [], removed: [],
      impact: { tasks: [{ id: 'T1', title: 'T', requirements: ['REQ-002'] }], scenarios: [{ label: 'features/b.feature › S', requirements: ['REQ-002'] }] },
    });
  });
});
