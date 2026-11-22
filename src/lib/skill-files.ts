// Versioned skill files (brainstorm styles, standards): seeded from seed/<kind>/<name>/SKILL.md into
// <project>/.keel/<kind>/<name>@<version>.md (ADR-0010), and read back by ref. A project standard Keel writes
// itself (CR-0010) uses the folder form <project>/.keel/standards/<name>/SKILL.md.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type Result } from './result';
import { VERSIONED_REF } from './templates/library';

export type SkillKind = 'styles' | 'standards';

interface Versioned {
  id: string;
  version: number;
  ref: string;
  name: string;
}

/** Allowed names of styles and standards. */
export const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The .keel folder of one kind of skill file in a project. */
export function skillDir(root: string, kind: SkillKind): string {
  return join(root, '.keel', kind);
}

/** Copies seed/<kind>/<name>/SKILL.md into the project's .keel/ at Initialise. Every file must parse, or nothing is copied. */
export function seedSkills<E extends string>(
  root: string, seedDir: string, kind: SkillKind, parse: (content: string) => Result<{ ref: string }, E>,
): Result<number, E> {
  const dir = skillDir(root, kind);
  const source = join(seedDir, kind);
  if (existsSync(dir) || !existsSync(source)) return ok(0);
  const staged: { from: string; ref: string }[] = [];
  for (const name of readdirSync(source).sort()) {
    const from = join(source, name, 'SKILL.md');
    if (!existsSync(from)) continue;
    const skill = parse(readFileSync(from, 'utf8'));
    if (!skill.ok) return fail(skill.error, `${from}: ${skill.message}`);
    staged.push({ from, ref: skill.value.ref });
  }
  mkdirSync(dir, { recursive: true });
  staged.forEach(({ from, ref }) => copyFileSync(from, join(dir, `${ref}.md`)));
  return ok(staged.length);
}

/** The latest version of every skill file of a kind, sorted by name. Files that do not parse, or are misnamed, are skipped. */
export function latestSkills<T extends Versioned>(root: string, kind: SkillKind, parse: (content: string) => Result<T, string>): T[] {
  const dir = skillDir(root, kind);
  if (!existsSync(dir)) return [];
  const latest = new Map<string, T>();
  const consider = (content: string, matches: (skill: T) => boolean) => {
    const skill = parse(content);
    if (!skill.ok || !matches(skill.value)) return;
    if ((latest.get(skill.value.id)?.version ?? 0) < skill.value.version) latest.set(skill.value.id, skill.value);
  };
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) consider(readFileSync(join(dir, file), 'utf8'), (skill) => `${skill.ref}.md` === file);
  // The folder form, <name>/SKILL.md, as a project standard written by Keel (CR-0010).
  for (const name of readdirSync(dir).filter((f) => NAME.test(f) && existsSync(join(dir, f, 'SKILL.md')))) {
    consider(readFileSync(join(dir, name, 'SKILL.md'), 'utf8'), (skill) => skill.id === name);
  }
  return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The raw content of one version, by ref such as "coach@1"; undefined for an unknown or unsafe ref. */
export function readSkillFile(root: string, kind: SkillKind, ref: string): string | undefined {
  if (!VERSIONED_REF.test(ref)) return undefined;
  const file = join(skillDir(root, kind), `${ref}.md`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  // The folder form holds one version: <name>/SKILL.md whose version matches the ref.
  const [name, version] = ref.split('@');
  const folder = join(skillDir(root, kind), name ?? '', 'SKILL.md');
  if (!existsSync(folder)) return undefined;
  const content = readFileSync(folder, 'utf8');
  return new RegExp(`^version:\\s*${version}\\s*$`, 'm').test(content) ? content : undefined;
}
