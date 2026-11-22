import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempStore } from '../store/test-store';
import { ensureStandards, listStandards, parseStandard, readStandard, standardsFor } from './library';

const SEED = join(process.cwd(), 'seed');

describe('standards', () => {
  it('parses a standard skill file', () => {
    expect(parseStandard('---\nname: api-design\ndescription: APIs.\nowner: Arch\nversion: 1\napplies_to: [spec, code]\n---\n\n# API design\n\n- Rule\n')).toEqual({
      ok: true, value: { id: 'api-design', version: 1, ref: 'api-design@1', name: 'API design', description: 'APIs.', owner: 'Arch', appliesTo: ['spec', 'code'], rules: '# API design\n\n- Rule' },
    });
    expect(parseStandard('---\nname: x\nversion: 1\napplies_to: [deploy]\n---\n')).toMatchObject({ error: 'invalid-standard' });
  });

  it('seeds every standard once and lists them by name', () => {
    const { root: home } = tempStore();
    expect(ensureStandards(home, SEED)).toEqual({ ok: true, value: readdirSync(join(SEED, 'standards')).length });
    expect(ensureStandards(home, SEED)).toEqual({ ok: true, value: 0 });
    expect(listStandards(home).map((s) => s.ref)).toEqual(['api-design@1', 'bdd-style@1', 'plain-markdown@1', 'security-baseline@2', 'small-steps@1', 'typescript-conventions@3']);
  });

  it('reads by ref and picks the ones that apply to a stage', () => {
    const { root: home } = tempStore();
    ensureStandards(home, SEED);
    expect(readStandard(home, 'security-baseline@2')).toMatchObject({ ok: true, value: { owner: 'Security team' } });
    expect(readStandard(home, '../x@1')).toMatchObject({ error: 'not-found' });
    expect(standardsFor(home, ['small-steps@1', 'bdd-style@1', 'gone@1'], 'spec').map((s) => s.id)).toEqual(['bdd-style']);
    expect(standardsFor(home, ['small-steps@1', 'gone@1']).map((s) => s.id)).toEqual(['small-steps']);
  });
});
