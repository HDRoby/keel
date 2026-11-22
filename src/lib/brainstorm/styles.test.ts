import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempStore } from '../store/test-store';
import { ensureStyles, listStyles, parseStyle, readStyle, readStyleFile, saveStyleVersion, styleVersions } from './styles';

const SEED = join(process.cwd(), 'seed');

describe('styles', () => {
  it('parses a style skill file', () => {
    expect(parseStyle('---\nname: coach\ndescription: Kind.\nversion: 2\n---\n\n# Coach\n\nBe kind.\n')).toEqual({
      ok: true, value: { id: 'coach', version: 2, ref: 'coach@2', name: 'Coach', description: 'Kind.', instructions: '# Coach\n\nBe kind.' },
    });
    expect(parseStyle('---\nname: Bad Name\nversion: 1\n---\n')).toMatchObject({ error: 'invalid-style' });
  });

  it('seeds every style once and lists the latest versions by name', () => {
    const { root: home } = tempStore();
    const seeded = ensureStyles(home, SEED);
    expect(seeded.ok && seeded.value).toBe(readdirSync(join(SEED, 'styles')).length);
    expect(ensureStyles(home, SEED)).toEqual({ ok: true, value: 0 });
    writeFileSync(join(home, '.keel', 'styles', 'challenger@2.md'), '---\nname: challenger\nversion: 2\n---\n# Challenger\n');
    const styles = listStyles(home);
    expect(styles.map((s) => s.ref)).toEqual(['challenger@2', 'coach@1', 'cost-value@1', 'engineering-first@1', 'market@1']);
    expect(styles[0]?.name).toBe('Challenger');
  });

  it('reads a style by ref and rejects unknown or unsafe refs', () => {
    const { root: home } = tempStore();
    ensureStyles(home, SEED);
    expect(readStyle(home, 'challenger@1')).toMatchObject({ ok: true, value: { name: 'Challenger' } });
    expect(readStyle(home, 'challenger@9')).toMatchObject({ error: 'not-found' });
    expect(readStyle(home, '../x@1')).toMatchObject({ error: 'not-found' });
  });

  it('skips a seed folder without SKILL.md', () => {
    const store = tempStore();
    const seed = join(store.root, 'seed');
    mkdirSync(join(seed, 'styles', 'empty'), { recursive: true });
    expect(ensureStyles(join(store.root, 'ws'), seed)).toEqual({ ok: true, value: 0 });
  });

  it('saves an edit as the next version and keeps the old one', () => {
    const { root: home } = tempStore();
    ensureStyles(home, SEED);
    const old = readStyleFile(home, 'coach@1');
    if (!old.ok) throw new Error(old.message);
    const saved = saveStyleVersion(home, 'coach', old.value.replace('# Coach', '# Coach (gentle)'));
    expect(saved).toMatchObject({ ok: true, value: { ref: 'coach@2', name: 'Coach (gentle)' } });
    expect(styleVersions(home, 'coach')).toEqual([1, 2]);
    expect(readStyleFile(home, 'coach@1')).toEqual(old);
    expect(listStyles(home).find((s) => s.id === 'coach')?.version).toBe(2);
  });

  it('refuses a renamed, broken or unknown style', () => {
    const { root: home } = tempStore();
    ensureStyles(home, SEED);
    expect(saveStyleVersion(home, 'coach', '---\nname: other\nversion: 1\n---\n# X\n')).toMatchObject({ error: 'name-changed' });
    expect(saveStyleVersion(home, 'coach', 'no header')).toMatchObject({ error: 'invalid-style' });
    expect(saveStyleVersion(home, 'nope', '---\nname: nope\nversion: 1\n---\n')).toMatchObject({ error: 'not-found' });
    expect(styleVersions(home, '../x')).toEqual([]);
    expect(readStyleFile(home, '../x@1')).toMatchObject({ error: 'not-found' });
  });
});
