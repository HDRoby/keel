// "Your AI files and the Keel standard" (CR-0015): each agent file in the folder, its Keel equivalent and a proposal,
// from what handoff does with it (R15, CR-0010). Read locally; no model call.
import type { ReadinessScan } from './rules';

export type Proposal = 'Keep' | 'Point to' | 'Adopt';
export interface MappingRow { file: string; keel: string; proposal: Proposal; note: string }

const POINTERS = ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.windsurfrules'];

/** The mapping table, for folders with AI files (existing-ai, keel); empty otherwise. */
export function mapAgentFiles(scan: ReadinessScan, read: (path: string) => string | undefined): MappingRow[] {
  if (scan.kase !== 'existing-ai' && scan.kase !== 'keel') return [];
  const has = (path: string) => scan.facts.files.includes(path);
  const under = (dir: string) => scan.facts.files.filter((f) => f.startsWith(dir));
  const rows: MappingRow[] = [];
  if (has('AGENTS.md')) {
    const keel = /<!-- keel:start -->/.test(read('AGENTS.md') ?? '');
    rows.push({ file: 'AGENTS.md', keel: 'AGENTS.md', proposal: 'Keep', note: keel ? 'Keel\'s instructions are already between the keel:start and keel:end markers.' : 'Keel adds its instructions between keel:start and keel:end markers at handoff; your text stays.' });
  }
  for (const file of POINTERS.filter(has)) {
    const points = /AGENTS\.md/.test(read(file) ?? '');
    rows.push({ file, keel: 'Points to AGENTS.md', proposal: points ? 'Keep' : 'Point to', note: points ? 'Already points to AGENTS.md.' : 'Move what it says that AGENTS.md lacks into AGENTS.md, then point to it.' });
  }
  const cursor = under('.cursor/rules/');
  if (cursor.length || has('.cursorrules')) {
    const file = cursor.length ? `.cursor/rules/ (${cursor.length} ${cursor.length === 1 ? 'file' : 'files'})` : '.cursorrules';
    rows.push({ file, keel: '.keel/standards/', proposal: 'Adopt', note: 'Copied as a project standard, so every agent gets the rules. The originals stay.' });
  }
  if (under('.claude/agents/').length) rows.push({ file: '.claude/agents/', keel: 'Agent kit', proposal: 'Keep', note: 'Subagents with the same name as Keel\'s become handoff choices; the others stay.' });
  if (under('.claude/skills/').length) rows.push({ file: '.claude/skills/', keel: 'Standards as skills', proposal: 'Keep', note: 'Keel writes its standards next to yours.' });
  if (scan.facts.files.some((f) => /^specs\/[^/]+\/spec\.md$/.test(f))) rows.push({ file: 'specs/ (Spec Kit)', keel: 'docs/spec.md', proposal: 'Adopt', note: 'Imported into the baseline requirements; the originals stay.' });
  if (under('.kiro/specs/').length) rows.push({ file: '.kiro/specs/ (Kiro)', keel: 'docs/spec.md', proposal: 'Adopt', note: 'Imported into the baseline requirements; the originals stay.' });
  return rows;
}
