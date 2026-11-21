import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { createProject, projectDir } from '../store/workspace';
import {
  ensureLibrary, listTemplates, parseTemplateRef, readTemplate, removeTemplate, removeTemplateVersion, saveTemplateVersion,
  seedDir, TEMPLATE_ID, templateIdentity, templateName, templateOptions, templateUsage, VERSIONED_REF,
} from './library';

const SEED = join(process.cwd(), 'seed');

function seeded() {
  const store = tempStore();
  ensureLibrary(store.home, SEED);
  return store;
}

describe('names and identity', () => {
  it('parses refs and builds display names', () => {
    expect(parseTemplateRef('standard-intent@3')).toEqual({ id: 'standard-intent', version: 3 });
    expect(parseTemplateRef('../x@1')).toBeUndefined();
    expect(templateName('standard-intent', 3)).toBe('Standard intent v3');
    expect(TEMPLATE_ID.test('standard-intent')).toBe(true);
    expect(TEMPLATE_ID.test('../x')).toBe(false);
    expect(VERSIONED_REF.test('challenger@1')).toBe(true);
    expect(VERSIONED_REF.test('challenger')).toBe(false);
  });

  it('reads identity from templates and agent-kit files, and rejects others', () => {
    expect(templateIdentity('---\ntemplate: plan@2\nkind: plan\n---\n')).toEqual({ ok: true, value: { id: 'plan', version: 2, kind: 'plan' } });
    expect(templateIdentity('---\nname: verifier\ntemplate_version: 1\n---\n')).toMatchObject({ value: { id: 'verifier', kind: 'agent-kit' } });
    expect(templateIdentity('# no header')).toMatchObject({ error: 'invalid-template' });
  });

  it('finds the seed folder from KEEL_SEED or the working folder', () => {
    expect(seedDir({ KEEL_SEED: '/s' })).toBe('/s');
    expect(seedDir({})).toBe(SEED);
  });
});

describe('library', () => {
  it('seeds every template and agent-kit file once, grouped by kind', () => {
    const store = tempStore();
    const first = ensureLibrary(store.home, SEED);
    expect(first.ok && first.value).toBe(readdirSync(join(SEED, 'templates')).length + readdirSync(join(SEED, 'agent-kit')).length);
    expect(ensureLibrary(store.home, SEED)).toEqual({ ok: true, value: 0 });
    const templates = listTemplates(store.home);
    expect(templates.find((t) => t.id === 'standard-intent')).toMatchObject({ name: 'Standard intent v3', group: 'intent', versions: [3] });
    expect(templates.find((t) => t.id === 'task')?.group).toBe('plan');
    expect(templates.find((t) => t.id === 'verifier')?.group).toBe('agent-kit');
    expect(templates[0]?.group).toBe('intent');
  });

  it('saves an edit as the next version and keeps the old one', () => {
    const store = seeded();
    const old = readTemplate(store.home, 'standard-intent');
    if (!old.ok) throw new Error(old.message);
    const saved = saveTemplateVersion(store.home, 'standard-intent', old.value.content.replace('## Problem', '## The problem'));
    expect(saved).toMatchObject({ ok: true, value: { version: 4 } });
    expect(readTemplate(store.home, 'standard-intent')).toMatchObject({ value: { version: 4 } });
    expect(readTemplate(store.home, 'standard-intent', 3).ok && readTemplate(store.home, 'standard-intent', 3)).toMatchObject({ value: { content: old.value.content } });
    expect(templateIdentity(saved.ok ? saved.value.content : '')).toMatchObject({ value: { id: 'standard-intent', version: 4 } });
  });

  it('lists a group as choices, every version or only the latest', () => {
    const store = seeded();
    const old = readTemplate(store.home, 'standard-intent');
    if (!old.ok) throw new Error(old.message);
    saveTemplateVersion(store.home, 'standard-intent', old.value.content);
    const all = templateOptions(store.home, 'intent', 'all');
    expect(all).toContainEqual({ ref: 'standard-intent@3', name: 'Standard intent v3' });
    expect(all).toContainEqual({ ref: 'standard-intent@4', name: 'Standard intent v4' });
    const latest = templateOptions(store.home, 'intent', 'latest');
    expect(latest).toContainEqual({ ref: 'standard-intent@4', name: 'Standard intent v4' });
    expect(latest.map((t) => t.ref)).not.toContain('standard-intent@3');
    expect(templateOptions(store.home, 'spec', 'all').every((t) => !t.ref.startsWith('standard-intent@'))).toBe(true);
  });

  it('versions agent-kit files through template_version', () => {
    const store = seeded();
    const saved = saveTemplateVersion(store.home, 'verifier', '---\nname: verifier\ntemplate_version: 1\n---\n\n# Verifier\n');
    expect(saved.ok && saved.value.content).toMatch(/template_version: 2/);
  });

  it('refuses a kind change, broken content and unknown templates', () => {
    const store = seeded();
    expect(saveTemplateVersion(store.home, 'standard-intent', '---\ntemplate: x@1\nkind: plan\n---\n')).toMatchObject({ error: 'kind-changed' });
    expect(saveTemplateVersion(store.home, 'standard-intent', 'nothing')).toMatchObject({ error: 'invalid-template' });
    expect(readTemplate(store.home, 'nope')).toMatchObject({ error: 'not-found' });
    expect(readTemplate(store.home, 'standard-intent', 9)).toMatchObject({ error: 'not-found' });
  });
});

describe('usage and removal', () => {
  it('blocks removal while a project uses the template, and names the project', async () => {
    const store = seeded();
    await createProject(store, { slug: 'readme', title: 'Readme helper', author: 'Ada' });
    await createDocument(store, 'readme', { kind: 'intent', title: 'R', body: 'x', template: 'standard-intent@3' });
    expect(templateUsage(store.home, 'standard-intent')).toEqual([
      { slug: 'readme', title: 'Readme helper', documents: ['docs/intent.md (standard-intent@3)'] },
    ]);
    expect(removeTemplate(store.home, 'standard-intent')).toMatchObject({ error: 'in-use', message: 'Used by 1 project: Readme helper' });
    expect(existsSync(join(store.home, 'templates', 'standard-intent@3.md'))).toBe(true);
  });

  it('removes every version of an unused template', () => {
    const store = seeded();
    expect(removeTemplate(store.home, 'lightweight-intent')).toEqual({ ok: true, value: 1 });
    expect(listTemplates(store.home).some((t) => t.id === 'lightweight-intent')).toBe(false);
    expect(removeTemplate(store.home, 'lightweight-intent')).toMatchObject({ error: 'not-found' });
  });

  it('removes one unused version, refuses a version in use, and counts a brainstorm as a use', async () => {
    const store = seeded();
    const v3 = readTemplate(store.home, 'standard-intent', 3);
    if (!v3.ok) throw new Error(v3.message);
    saveTemplateVersion(store.home, 'standard-intent', v3.value.content);
    await createProject(store, { slug: 'readme', title: 'Readme helper', author: 'Ada' });
    await createDocument(store, 'readme', { kind: 'intent', title: 'R', body: 'x', template: 'standard-intent@3' });
    expect(removeTemplateVersion(store.home, 'standard-intent', 3)).toMatchObject({ error: 'in-use', message: 'v3 is used by 1 project: Readme helper' });
    expect(removeTemplateVersion(store.home, 'standard-intent', 4)).toEqual({ ok: true, value: 1 });
    expect(listTemplates(store.home).find((t) => t.id === 'standard-intent')?.versions).toEqual([3]);
    expect(removeTemplateVersion(store.home, 'standard-intent', 9)).toMatchObject({ error: 'not-found' });
    writeFileSync(join(projectDir('readme', store.home), 'brainstorm.md'), '---\ntemplate: lightweight-intent@1\n---\n');
    expect(templateUsage(store.home, 'lightweight-intent')).toEqual([{ slug: 'readme', title: 'Readme helper', documents: ['brainstorm.md (lightweight-intent@1)'] }]);
  });
});
