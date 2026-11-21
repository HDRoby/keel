// Gives requirement statements from the brainstorm stable REQ IDs (REQ-004). IDs are never reused.
import { reqIds } from './parse';

export const REQUIREMENTS_SECTION = 'Requirements';

const BULLET = /^\s*(?:[-*]|\d+\.)\s+/;
const TYPED_ID = /^REQ-\d{3,}/;   // a statement the proposer already gave an ID

function clean(line: string): string {
  return line.replace(BULLET, '').replace(/\s+/g, ' ').trim();
}

/** Lines that are requirement statements: list items in any answer, or every line of a first answer with no list. */
export function requirementCandidates(answers: string[]): string[] {
  const lines = answers.flatMap((answer, i) => {
    const all = answer.split('\n').filter((l) => l.trim());
    const bullets = all.filter((l) => BULLET.test(l));
    return bullets.length > 0 || i > 0 ? bullets : all;
  });
  return [...new Set(lines.map(clean).filter(Boolean))];
}

/** Candidates that have no ID yet: neither written by the proposer nor assigned before. */
export function unassigned(candidates: string[], ids: Record<string, string>): string[] {
  return candidates.filter((c) => !ids[c] && reqIds(c).length === 0 && !TYPED_ID.test(c));
}

export function formatReqId(n: number): string {
  return `REQ-${String(n).padStart(3, '0')}`;
}

/** The answers with each requirement statement as "- REQ-00N statement"; other text stays as it is. */
export function renderRequirements(answers: string[], ids: Record<string, string>): string[] {
  const candidates = new Set(requirementCandidates(answers));
  return answers.map((answer) => answer.split('\n').map((line) => {
    const statement = clean(line);
    if (!candidates.has(statement)) return line;
    if (TYPED_ID.test(statement)) return `- ${statement}`;
    const id = ids[statement];
    return id ? `- ${id} ${statement}` : line;
  }).join('\n'));
}
