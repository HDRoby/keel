import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fail, ok } from './result';
import { tempStore } from './store/test-store';
import { latestSkills, readSkillFile, seedSkills, skillDir } from './skill-files';

// A minimal parser: "<name>@<version>|<title>".
function parse(content: string) {
  const match = /^([a-z]+)@(\d+)\|(.+)$/.exec(content.trim());
  return match
    ? ok({ id: match[1] ?? '', version: Number(match[2]), ref: `${match[1]}@${match[2]}`, name: match[3] ?? '' })
    : fail('invalid', 'Not a skill');
}

function seedWith(home: string, files: Record<string, string>): string {
  const seed = join(home, 'seed');
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(seed, 'styles', name), { recursive: true });
    writeFileSync(join(seed, 'styles', name, 'SKILL.md'), content);
  }
  mkdirSync(join(seed, 'styles', 'empty'), { recursive: true });
  return seed;
}

describe('skill files', () => {
  it('keeps each kind in its own workspace folder', () => {
    expect(skillDir('/ws', 'standards')).toBe(join('/ws', 'standards'));
  });

  it('seeds once, skipping folders without SKILL.md', () => {
    const { home } = tempStore();
    const seed = seedWith(home, { beta: 'beta@2|Beta', alpha: 'alpha@1|Alpha' });
    expect(seedSkills(join(home, 'ws'), seed, 'styles', parse)).toEqual({ ok: true, value: 2 });
    expect(readdirSync(join(home, 'ws', 'styles')).sort()).toEqual(['alpha@1.md', 'beta@2.md']);
    expect(seedSkills(join(home, 'ws'), seed, 'styles', parse)).toEqual({ ok: true, value: 0 });
    expect(seedSkills(join(home, 'ws'), seed, 'standards', parse)).toEqual({ ok: true, value: 0 });
  });

  it('copies nothing when a seed file does not parse', () => {
    const { home } = tempStore();
    const seed = seedWith(home, { alpha: 'alpha@1|Alpha', bad: 'nonsense' });
    expect(seedSkills(join(home, 'ws'), seed, 'styles', parse)).toMatchObject({ ok: false, error: 'invalid', message: expect.stringContaining('bad') });
    expect(latestSkills(join(home, 'ws'), 'styles', parse)).toEqual([]);
  });

  it('lists the latest version of each, by name, skipping broken or misnamed files', () => {
    const { home } = tempStore();
    const dir = skillDir(home, 'styles');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'zed@1.md'), 'zed@1|A zed');
    writeFileSync(join(dir, 'zed@3.md'), 'zed@3|Zed');
    writeFileSync(join(dir, 'yak@1.md'), 'yak@1|Yak');
    writeFileSync(join(dir, 'yak@2.md'), 'yak@9|Misnamed');
    writeFileSync(join(dir, 'bad@1.md'), 'nonsense');
    expect(latestSkills(home, 'styles', parse).map((s) => s.ref)).toEqual(['yak@1', 'zed@3']);
  });

  it('reads one version by ref and refuses unknown or unsafe refs', () => {
    const { home } = tempStore();
    mkdirSync(skillDir(home, 'standards'), { recursive: true });
    writeFileSync(join(skillDir(home, 'standards'), 'alpha@1.md'), 'alpha@1|Alpha');
    expect(readSkillFile(home, 'standards', 'alpha@1')).toBe('alpha@1|Alpha');
    expect(readSkillFile(home, 'standards', 'alpha@2')).toBeUndefined();
    expect(readSkillFile(home, 'standards', '../standards/alpha@1')).toBeUndefined();
  });
});
