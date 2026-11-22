// Grounding the model review (CR-0015, ADR-0018): Keel keeps only what the scan can confirm. A finding or advice
// whose evidence names a path that is not in the scan, or a line past the end of the file, is dropped. The model can
// lower an area from Ready to Partly with evidence; it can never raise a rating set by the rules.
import type { Area, Evidence, Rating, RuleResult } from './rules';
import type { AreaAnswer } from './review';

export interface Grounded { answer: AreaAnswer; dropped: number; rating: Rating }

/** True when the path is a file in the scan, or a folder (ending in /) that holds one, and the line is in the file. */
export function confirmed(evidence: Evidence, files: Set<string>, lineCount: (path: string) => number | undefined): boolean {
  const path = evidence.path.replace(/^\.\//, '');
  if (path.endsWith('/')) return [...files].some((f) => f.startsWith(path));
  if (!files.has(path)) return false;
  if (evidence.line === undefined) return true;
  const lines = lineCount(path);
  return lines !== undefined && evidence.line >= 1 && evidence.line <= lines;
}

/** The model's answer for one area, with everything the scan cannot confirm removed, and the area's rating. */
export function ground(area: Area, answer: AreaAnswer, results: RuleResult[], ruleRating: Rating, files: Set<string>, lineCount: (path: string) => number | undefined): Grounded {
  const ok = (evidence: Evidence[]) => evidence.length > 0 && evidence.every((e) => confirmed(e, files, lineCount));
  const failed = new Set(results.filter((r) => r.area === area && r.status === 'fail').map((r) => r.rule));
  const findings = answer.findings.filter((f) => ok(f.evidence));
  const advice = answer.advice.filter((a) => ok(a.evidence));
  const why = answer.why.filter((w) => failed.has(w.rule));
  const dropped = answer.findings.length - findings.length + answer.advice.length - advice.length;
  const rating: Rating = ruleRating === 'Ready' && findings.some((f) => f.lowersRating) ? 'Partly' : ruleRating;
  return { answer: { why, findings, advice }, dropped, rating };
}
