import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fileNameFor, fromYamlDate, fromYamlTime, initialiseProject, isInitialised, keelDir, projectRoot, readProject,
  reserveRequirementIds, setProjectStandards, today,
} from './workspace';
import { fileHistory } from './git';
import { tempStore } from './test-store';

const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

describe('project folder', () => {
  it('takes the folder from KEEL_PROJECT_DIR, which must exist', () => {
    const { root } = tempStore();
    expect(projectRoot({ KEEL_PROJECT_DIR: root })).toBe(root);
    expect(() => projectRoot({})).toThrow(/npx keel/);
    expect(() => projectRoot({ KEEL_PROJECT_DIR: join(root, 'missing') })).toThrow(/not a folder/);
  });

  it('keeps Keel in .keel', () => {
    expect(keelDir('/work/app')).toBe('/work/app/.keel');
    expect(fileNameFor('Expense tracker!')).toBe('expense-tracker');
    expect(fileNameFor('***')).toBe('project');
  });
});

describe('dates', () => {
  it('turns YAML dates into ISO dates and leaves other values alone', () => {
    expect(fromYamlDate(new Date('2026-11-20T00:00:00Z'))).toBe('2026-11-20');
    expect(fromYamlDate('2026-11-21')).toBe('2026-11-21');
    expect(fromYamlTime(new Date('2026-11-20T08:30:00Z'))).toBe('2026-11-20T08:30:00.000Z');
    expect(fromYamlTime('2026-11-21T09:00:00Z')).toBe('2026-11-21T09:00:00Z');
  });

  it('reads today from the store clock', () => {
    expect(today(tempStore('2026-01-02'))).toBe('2026-01-02');
  });
});

describe('initialiseProject', () => {
  it('runs git init, writes .keel with config, gitignore and libraries, and commits only .keel', async () => {
    const store = tempStore();
    writeFileSync(join(store.root, 'notes.txt'), 'mine');
    expect(isInitialised(store.root)).toBe(false);
    const created = await initialiseProject(store, { title: 'Expense tracker', author: 'Ada', standards: ['bdd-style@1'], templates: { intent: 'standard-intent@3' }, style: 'coach@1' });
    expect(created).toMatchObject({ ok: true, value: { id: 'PRJ-0001', title: 'Expense tracker', created: '2026-11-20', style: 'coach@1', paths: { docs: 'docs' }, commit: 'auto' } });
    expect(isInitialised(store.root)).toBe(true);
    expect(readFileSync(join(store.root, '.keel/config.yml'), 'utf8')).toContain('title: Expense tracker');
    expect(readFileSync(join(store.root, '.keel/.gitignore'), 'utf8')).toBe('cache/\n');
    for (const folder of ['templates', 'agent-kit', 'styles', 'standards']) expect(existsSync(join(store.root, '.keel', folder))).toBe(true);
    expect(git(store.root, 'log', '--format=%an|%s')).toBe('Keel|Keel: Initialise project');
    expect(git(store.root, 'show', '--name-only', '--format=', 'HEAD').split('\n').every((f) => f.startsWith('.keel/'))).toBe(true);
    expect(git(store.root, 'status', '--porcelain')).toBe('?? notes.txt');
  });

  it('keeps an existing repository and its history', async () => {
    const store = tempStore();
    git(store.root, 'init', '-q', '--initial-branch=main');
    writeFileSync(join(store.root, 'README.md'), '# App\n');
    git(store.root, 'add', 'README.md');
    git(store.root, '-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', 'commit', '-qm', 'Start');
    await initialiseProject(store, { title: 'App', author: 'Ada' });
    expect(git(store.root, 'log', '--format=%s')).toBe('Keel: Initialise project\nStart');
  });

  it('refuses to initialise twice or to write outside .keel', async () => {
    const store = tempStore();
    expect(await initialiseProject(store, { title: 'A', author: 'Ada', files: [{ path: 'src/x.ts', content: '' }] })).toMatchObject({ error: 'invalid-config' });
    await initialiseProject(store, { title: 'A', author: 'Ada' });
    expect(await initialiseProject(store, { title: 'A', author: 'Ada' })).toMatchObject({ error: 'already-initialised' });
  });

  it('reads the project back and reports a missing or broken config', async () => {
    const store = tempStore();
    expect(readProject(store.root)).toMatchObject({ error: 'not-initialised' });
    await initialiseProject(store, { title: 'A', description: 'An idea', author: 'Ada' });
    expect(readProject(store.root)).toMatchObject({ ok: true, value: { title: 'A', description: 'An idea' } });
    writeFileSync(join(store.root, '.keel/config.yml'), 'id: nope\n');
    expect(readProject(store.root)).toMatchObject({ error: 'invalid-config' });
  });
});

describe('reserveRequirementIds', () => {
  it('hands out increasing IDs that are never reused, past any ID already in use', async () => {
    const store = tempStore();
    expect(await reserveRequirementIds(store, 1)).toMatchObject({ error: 'not-initialised' });
    await initialiseProject(store, { title: 'P', author: 'Ada' });
    expect(await reserveRequirementIds(store, 2)).toEqual({ ok: true, value: ['REQ-001', 'REQ-002'] });
    expect(await reserveRequirementIds(store, 1)).toEqual({ ok: true, value: ['REQ-003'] });
    expect(await reserveRequirementIds(store, 1, 9)).toEqual({ ok: true, value: ['REQ-010'] });
    expect(await reserveRequirementIds(store, 0)).toEqual({ ok: true, value: [] });
    expect((await fileHistory(store.root, '.keel/config.yml')).at(-1)?.message).toBe('Keel: reserve REQ-010');
  });

  it('starts past the IDs already in the documents', async () => {
    const store = tempStore();
    await initialiseProject(store, { title: 'P', author: 'Ada' });
    mkdirSync(join(store.root, 'docs'));
    writeFileSync(join(store.root, 'docs/intent.md'), '---\nid: INT-0001\n---\n\n- REQ-007 Something\n');
    expect(await reserveRequirementIds(store, 1)).toEqual({ ok: true, value: ['REQ-008'] });
  });
});

describe('project standards', () => {
  it('records the standards chosen at Initialise and replaces them in Project setup', async () => {
    const store = tempStore();
    await initialiseProject(store, { title: 'P', author: 'Ada', standards: ['bdd-style@1'] });
    expect(readProject(store.root)).toMatchObject({ ok: true, value: { standards: ['bdd-style@1'] } });
    expect(await setProjectStandards(store, ['security-baseline@2', 'security-baseline@2'])).toMatchObject({ ok: true, value: { standards: ['security-baseline@2'] } });
    expect((await fileHistory(store.root, '.keel/config.yml')).at(-1)?.message).toBe('Keel: standards security-baseline@2');
    await setProjectStandards(store, ['security-baseline@2']);
    expect(await fileHistory(store.root, '.keel/config.yml')).toHaveLength(2);
  });
});
