import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, reserveRequirementIds, setProjectStandards, fromYamlDate, fromYamlTime, keelHome, listProjectSlugs, projectDir, readProject, SLUG, today } from './workspace';
import { fileHistory } from './git';
import { tempStore } from './test-store';

describe('workspace', () => {
  it('uses KEEL_HOME when set', () => {
    expect(keelHome({ KEEL_HOME: '/tmp/k' })).toBe('/tmp/k');
  });

  it('defaults to ~/.keel', () => {
    expect(keelHome({})).toMatch(/\.keel$/);
  });

  it('builds a project folder from a safe slug', () => {
    expect(projectDir('keel', '/tmp/k')).toBe('/tmp/k/projects/keel');
  });

  it('rejects unsafe slugs', () => {
    expect(() => projectDir('../etc', '/tmp/k')).toThrow();
    expect(SLUG.test('readme-helper')).toBe(true);
    expect(SLUG.test('../etc')).toBe(false);
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

describe('projects', () => {
  it('creates a git repository with project.md and indexes it', async () => {
    const store = tempStore();
    const created = await createProject(store, { slug: 'keel', title: 'Keel', author: 'Ada' });
    expect(created).toMatchObject({ ok: true, value: { id: 'PRJ-0001', created: '2026-11-20' } });
    const dir = projectDir('keel', store.home);
    expect(readFileSync(join(dir, 'project.md'), 'utf8')).toContain('author: Ada');
    expect((await fileHistory(dir, 'project.md'))[0]?.message).toBe('PRJ-0001: Create project');
    expect(store.index.projects()).toHaveLength(1);
  });

  it('numbers projects and lists them', async () => {
    const store = tempStore();
    await createProject(store, { slug: 'a', title: 'A', author: 'Ada' });
    const second = await createProject(store, { slug: 'b', title: 'B', author: 'Ada' });
    expect(second.ok && second.value.id).toBe('PRJ-0002');
    expect(listProjectSlugs(store.home)).toEqual(['a', 'b']);
  });

  it('refuses a duplicate or unsafe slug', async () => {
    const store = tempStore();
    await createProject(store, { slug: 'a', title: 'A', author: 'Ada' });
    expect(await createProject(store, { slug: 'a', title: 'A', author: 'Ada' })).toMatchObject({ error: 'already-exists' });
    expect(await createProject(store, { slug: '../x', title: 'X', author: 'Ada' })).toMatchObject({ error: 'invalid-slug' });
  });

  it('reads a project back and reports a missing one', async () => {
    const store = tempStore();
    await createProject(store, { slug: 'a', title: 'A', author: 'Ada' });
    expect(readProject('a', store.home)).toMatchObject({ ok: true, value: { slug: 'a', title: 'A' } });
    expect(readProject('zz', store.home)).toMatchObject({ error: 'not-found' });
  });
});

describe('reserveRequirementIds', () => {
  it('hands out increasing IDs that are never reused, past any ID already in use', async () => {
    const store = tempStore();
    await createProject(store, { slug: 'p', title: 'P', author: 'Ada' });
    expect(await reserveRequirementIds(store, 'p', 2)).toEqual({ ok: true, value: ['REQ-001', 'REQ-002'] });
    expect(await reserveRequirementIds(store, 'p', 1)).toEqual({ ok: true, value: ['REQ-003'] });
    expect(await reserveRequirementIds(store, 'p', 1, 9)).toEqual({ ok: true, value: ['REQ-010'] });
    expect(await reserveRequirementIds(store, 'p', 0)).toEqual({ ok: true, value: [] });
    expect(readProject('p', store.home)).toMatchObject({ ok: true, value: { id: 'PRJ-0001' } });
    expect((await fileHistory(projectDir('p', store.home), 'project.md')).at(-1)?.message).toBe('PRJ-0001: reserve REQ-010');
    expect(await reserveRequirementIds(store, 'nope', 1)).toMatchObject({ error: 'not-found' });
  });
});

describe('project standards', () => {
  it('records the standards chosen at Start and replaces them in Project setup', async () => {
    const store = tempStore();
    await createProject(store, { slug: 'p', title: 'P', author: 'Ada', standards: ['bdd-style@1'] });
    expect(readProject('p', store.home)).toMatchObject({ ok: true, value: { standards: ['bdd-style@1'] } });
    expect(await setProjectStandards(store, 'p', ['security-baseline@2', 'security-baseline@2'])).toMatchObject({ ok: true, value: { standards: ['security-baseline@2'] } });
    expect((await fileHistory(projectDir('p', store.home), 'project.md')).at(-1)?.message).toBe('PRJ-0001: standards security-baseline@2');
    await setProjectStandards(store, 'p', ['security-baseline@2']);
    expect(await fileHistory(projectDir('p', store.home), 'project.md')).toHaveLength(2);
    await createProject(store, { slug: 'q', title: 'Q', author: 'Ada' });
    expect(readProject('q', store.home)).toMatchObject({ value: { standards: [] } });
  });
});
