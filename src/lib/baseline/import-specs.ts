// Existing specs as baseline requirements (REQ-012, CR-0010): Spec Kit's specs/*/spec.md functional requirements and
// Kiro's .kiro/specs/*/requirements.md, read locally. Each keeps its original ID as an alias.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ImportedRequirement { text: string; alias: string; source: string }

export function importSpecs(root: string): ImportedRequirement[] {
  const found: ImportedRequirement[] = [];
  const specKit = join(root, 'specs');
  if (existsSync(specKit)) {
    for (const dir of readdirSync(specKit).sort()) {
      const file = join(specKit, dir, 'spec.md');
      if (!existsSync(file)) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/^\s*[-*]\s+\*{0,2}((?:FR|NFR)-\d+)\*{0,2}:?\s*(.+)$/gm)) {
        found.push({ alias: m[1] ?? '', text: (m[2] ?? '').trim(), source: `specs/${dir}/spec.md` });
      }
    }
  }
  const kiro = join(root, '.kiro', 'specs');
  if (existsSync(kiro)) {
    for (const dir of readdirSync(kiro).sort()) {
      const file = join(kiro, dir, 'requirements.md');
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/^###\s+Requirement\s+(\d+)[^\n]*\n[\s\S]*?\*\*User Story:\*\*\s*(.+)$/gm)) {
        found.push({ alias: `Requirement ${m[1]}`, text: (m[2] ?? '').trim(), source: `.kiro/specs/${dir}/requirements.md` });
      }
    }
  }
  return found;
}
