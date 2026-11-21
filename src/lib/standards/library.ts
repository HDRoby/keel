// Standards: versioned skill files seeded from seed/standards, chosen per project at Start (owner decision, T6).
// Editing the library on a Standards screen is on the roadmap's Next list.
import matter from 'gray-matter';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import { latestSkills, readSkillFile, seedSkills } from '../skill-files';
import { SLUG } from '../store/workspace';

export type StandardStage = 'spec' | 'plan' | 'code';

export interface Standard {
  id: string;            // e.g. security-baseline
  version: number;
  ref: string;           // e.g. security-baseline@2
  name: string;          // from the first heading, e.g. Security baseline
  description: string;
  owner: string;
  appliesTo: StandardStage[];
  rules: string;         // the skill body
}

const header = z.looseObject({
  name: z.string().regex(SLUG),
  description: z.string().default(''),
  owner: z.string().default(''),
  version: z.number().int().min(1),
  applies_to: z.array(z.enum(['spec', 'plan', 'code'])).default([]),
});

export function parseStandard(content: string): Result<Standard, 'invalid-standard'> {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content, {});
  } catch {
    return fail('invalid-standard', 'Front matter is not valid YAML');
  }
  const data = header.safeParse(parsed.data);
  if (!data.success) return fail('invalid-standard', z.prettifyError(data.error));
  const { name, description, owner, version, applies_to: appliesTo } = data.data;
  const title = /^# (.+)$/m.exec(parsed.content)?.[1]?.trim() ?? name;
  return ok({ id: name, version, ref: `${name}@${version}`, name: title, description, owner, appliesTo, rules: parsed.content.trim() });
}

/** Copies seed/standards/<name>/SKILL.md into the workspace on first run. */
export function ensureStandards(home: string, seedDir: string): Result<number, 'invalid-standard'> {
  return seedSkills(home, seedDir, 'standards', parseStandard);
}

/** The latest version of every standard, sorted by name. */
export function listStandards(home: string): Standard[] {
  return latestSkills(home, 'standards', parseStandard);
}

/** One version of a standard, by ref such as "security-baseline@2". */
export function readStandard(home: string, ref: string): Result<Standard, 'not-found' | 'invalid-standard'> {
  const content = readSkillFile(home, 'standards', ref);
  return content === undefined ? fail('not-found', `No standard ${ref}`) : parseStandard(content);
}

/** The project's standards that apply to a stage, skipping any that are no longer in the library. */
export function standardsFor(home: string, refs: string[], stage?: StandardStage): Standard[] {
  return refs.flatMap((ref) => {
    const standard = readStandard(home, ref);
    return standard.ok && (!stage || standard.value.appliesTo.includes(stage)) ? [standard.value] : [];
  });
}
