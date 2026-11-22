// Rules from the folder's own agent files (REQ-012, CR-0010): short, checkable instructions found in AGENTS.md,
// CLAUDE.md and Cursor or Copilot rules, proposed one by one as a project standard. Read locally: nothing is sent to
// a model. The accepted rules become .keel/standards/project-conventions/SKILL.md (the folder form of a standard).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONVENTIONS_FILE = '.keel/standards/project-conventions/SKILL.md';
export const CONVENTIONS_REF = 'project-conventions@1';

const SOURCES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.cursorrules', '.windsurfrules', '.github/copilot-instructions.md'];
const IMPERATIVE = /^(use|never|always|do not|don't|dont|prefer|avoid|run|keep|write|name|put|add|make sure|must|only)\b/i;

export interface FoundRule { rule: string; source: string }

/** One rule per bullet or short line that reads as an instruction; headings, code and long prose are skipped. */
export function rulesIn(text: string): string[] {
  let fenced = false;
  const rules: string[] = [];
  for (const raw of text.split('\n')) {
    if (/^\s*```/.test(raw)) { fenced = !fenced; continue; }
    if (fenced || /^\s*#/.test(raw)) continue;
    const line = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/\*\*/g, '').trim().replace(/\s+/g, ' ');
    if (line.length < 8 || line.length > 160 || !IMPERATIVE.test(line)) continue;
    const rule = line.replace(/[.;]\s*$/, '');
    if (!rules.includes(rule)) rules.push(rule);
  }
  return rules;
}

/** The rules in the folder's agent files, with the file each came from. */
export function rulesFromAgentFiles(root: string): FoundRule[] {
  const files = [...SOURCES.filter((f) => existsSync(join(root, f))),
    ...(existsSync(join(root, '.cursor', 'rules')) ? readdirSync(join(root, '.cursor', 'rules')).filter((f) => /\.(md|mdc)$/.test(f)).map((f) => `.cursor/rules/${f}`) : [])];
  const found: FoundRule[] = [];
  for (const source of files) {
    for (const rule of rulesIn(readFileSync(join(root, source), 'utf8'))) if (!found.some((f) => f.rule === rule)) found.push({ rule, source });
  }
  return found.slice(0, 40);
}

/** The project standard made of the accepted rules. */
export function conventionsStandard(rules: string[], sources: string[]): string {
  return [
    '---', 'name: project-conventions', 'description: The rules this project already had in its own agent files.', 'owner: This project', 'version: 1', 'applies_to: [plan, code]', '---', '',
    '# Project conventions', '', `Proposed by Keel from ${sources.join(', ') || 'the agent files'} when the folder was initialised, and accepted one by one.`, '',
    '## Rules', '', ...rules.map((r) => `- ${r}`), '',
  ].join('\n');
}
