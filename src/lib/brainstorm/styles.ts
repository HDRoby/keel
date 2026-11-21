// Brainstorm styles: versioned skill files seeded from seed/styles (REQ-011).
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import { latestSkills, readSkillFile, seedSkills, skillDir } from '../skill-files';
import { SLUG } from '../store/workspace';

export interface Style {
  id: string;           // e.g. challenger
  version: number;
  ref: string;          // e.g. challenger@1
  name: string;         // from the first heading, e.g. Challenger
  description: string;
  instructions: string; // the skill body, used as the system prompt
}

const header = z.looseObject({
  name: z.string().regex(SLUG),
  description: z.string().default(''),
  version: z.number().int().min(1),
});

/** Parses a style skill file. */
export function parseStyle(content: string): Result<Style, 'invalid-style'> {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content, {});
  } catch {
    return fail('invalid-style', 'Front matter is not valid YAML');
  }
  const data = header.safeParse(parsed.data);
  if (!data.success) return fail('invalid-style', z.prettifyError(data.error));
  const { name, description, version } = data.data;
  const title = /^# (.+)$/m.exec(parsed.content)?.[1]?.trim() ?? name;
  return ok({ id: name, version, ref: `${name}@${version}`, name: title, description, instructions: parsed.content.trim() });
}

/** Copies seed/styles/<name>/SKILL.md into the workspace on first run. */
export function ensureStyles(home: string, seedDir: string): Result<number, 'invalid-style'> {
  return seedSkills(home, seedDir, 'styles', parseStyle);
}

/** The latest version of every style, sorted by name. */
export function listStyles(home: string): Style[] {
  return latestSkills(home, 'styles', parseStyle);
}

/** One version of a style, by ref such as "challenger@1". */
export function readStyle(home: string, ref: string): Result<Style, 'not-found' | 'invalid-style'> {
  const content = readSkillFile(home, 'styles', ref);
  return content === undefined ? fail('not-found', `No style ${ref}`) : parseStyle(content);
}

/** Version numbers of one style, oldest first. */
export function styleVersions(home: string, id: string): number[] {
  const dir = skillDir(home, 'styles');
  if (!SLUG.test(id) || !existsSync(dir)) return [];
  return readdirSync(dir)
    .flatMap((f) => {
      const match = /^(.+)@(\d+)\.md$/.exec(f);
      return match?.[1] === id ? [Number(match[2])] : [];
    })
    .sort((a, b) => a - b);
}

/** The raw skill file of one style version, for editing. */
export function readStyleFile(home: string, ref: string): Result<string, 'not-found'> {
  const content = readSkillFile(home, 'styles', ref);
  return content === undefined ? fail('not-found', `No style ${ref}`) : ok(content);
}

/** Saves edited content as the next version of a style. Earlier versions, and brainstorms using them, stay as they were. */
export function saveStyleVersion(home: string, id: string, content: string): Result<Style, 'not-found' | 'invalid-style' | 'name-changed'> {
  const versions = styleVersions(home, id);
  const latest = versions.at(-1);
  if (latest === undefined) return fail('not-found', `No style ${id}`);
  const edited = parseStyle(content);
  if (!edited.ok) return edited;
  if (edited.value.id !== id) return fail('name-changed', `The name must stay "${id}"`);
  const parsed = matter(content, {});
  const next = matter.stringify(parsed.content, { ...parsed.data, version: latest + 1 });
  writeFileSync(join(skillDir(home, 'styles'), `${id}@${latest + 1}.md`), next);
  return parseStyle(next);
}
