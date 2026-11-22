// Brainstorm styles: versioned skill files seeded from seed/styles (REQ-011).
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import { latestSkills, NAME, readSkillFile, seedSkills, skillDir } from '../skill-files';

export interface Style {
  id: string;           // e.g. challenger
  version: number;
  ref: string;          // e.g. challenger@1
  name: string;         // from the first heading, e.g. Challenger
  description: string;
  instructions: string; // the skill body, used as the system prompt
  kind: StyleKind;      // brainstorm (Explore) or discussion (Discuss a change, CR-0016)
}

export type StyleKind = 'brainstorm' | 'discussion';
export const DEFAULT_DISCUSSION_STYLE = 'requirements-partner@1';

const header = z.looseObject({
  name: z.string().regex(NAME),
  description: z.string().default(''),
  version: z.number().int().min(1),
  kind: z.enum(['brainstorm', 'discussion']).default('brainstorm'),
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
  const { name, description, version, kind } = data.data;
  const title = /^# (.+)$/m.exec(parsed.content)?.[1]?.trim() ?? name;
  return ok({ id: name, version, ref: `${name}@${version}`, name: title, description, instructions: parsed.content.trim(), kind });
}

/** Copies seed/styles/<name>/SKILL.md into the project's .keel/ at Initialise. */
export function ensureStyles(root: string, seedDir: string): Result<number, 'invalid-style'> {
  return seedSkills(root, seedDir, 'styles', parseStyle);
}

/** The latest version of every style of one kind (brainstorm by default), sorted by name. */
export function listStyles(root: string, kind: StyleKind | 'all' = 'brainstorm'): Style[] {
  return latestSkills(root, 'styles', parseStyle).filter((s) => kind === 'all' || s.kind === kind);
}

/** One version of a style, by ref such as "challenger@1". */
export function readStyle(root: string, ref: string): Result<Style, 'not-found' | 'invalid-style'> {
  const content = readSkillFile(root, 'styles', ref);
  return content === undefined ? fail('not-found', `No style ${ref}`) : parseStyle(content);
}

/** Version numbers of one style, oldest first. */
export function styleVersions(root: string, id: string): number[] {
  const dir = skillDir(root, 'styles');
  if (!NAME.test(id) || !existsSync(dir)) return [];
  return readdirSync(dir)
    .flatMap((f) => {
      const match = /^(.+)@(\d+)\.md$/.exec(f);
      return match?.[1] === id ? [Number(match[2])] : [];
    })
    .sort((a, b) => a - b);
}

/** The raw skill file of one style version, for editing. */
export function readStyleFile(root: string, ref: string): Result<string, 'not-found'> {
  const content = readSkillFile(root, 'styles', ref);
  return content === undefined ? fail('not-found', `No style ${ref}`) : ok(content);
}

/** Saves edited content as the next version of a style. Earlier versions, and brainstorms using them, stay as they were. */
export function saveStyleVersion(root: string, id: string, content: string): Result<Style, 'not-found' | 'invalid-style' | 'name-changed'> {
  const versions = styleVersions(root, id);
  const latest = versions.at(-1);
  if (latest === undefined) return fail('not-found', `No style ${id}`);
  const edited = parseStyle(content);
  if (!edited.ok) return edited;
  if (edited.value.id !== id) return fail('name-changed', `The name must stay "${id}"`);
  const parsed = matter(content, {});
  const next = matter.stringify(parsed.content, { ...parsed.data, version: latest + 1 });
  writeFileSync(join(skillDir(root, 'styles'), `${id}@${latest + 1}.md`), next);
  return parseStyle(next);
}
