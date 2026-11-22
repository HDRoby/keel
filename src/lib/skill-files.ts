// Versioned skill files (brainstorm styles, standards): seeded from seed/<kind>/<name>/SKILL.md into
// <project>/.keel/<kind>/<name>@<version>.md (ADR-0010), and read back by ref.
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
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const skill = parse(readFileSync(join(dir, file), 'utf8'));
    if (!skill.ok || `${skill.value.ref}.md` !== file) continue;
    if ((latest.get(skill.value.id)?.version ?? 0) < skill.value.version) latest.set(skill.value.id, skill.value);
  }
  return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The raw content of one version, by ref such as "coach@1"; undefined for an unknown or unsafe ref. */
export function readSkillFile(root: string, kind: SkillKind, ref: string): string | undefined {
  const file = join(skillDir(root, kind), `${ref}.md`);
  return VERSIONED_REF.test(ref) && existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}
