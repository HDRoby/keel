// The model review of the readiness report (CR-0015): one short call per area, so small local models cope. Each call
// gets the folder case, the file and folder names, the rule results for the area, and the content of the files the
// user ticked that matter for it (capped). Nothing else is sent: never secret values, never unticked files.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Writer } from '../generate/writer';
import { mayHoldKeys } from './secrets';
import { adviceTitle, AREAS, ruleById, type Area, type ReadinessScan, type RuleResult } from './rules';

/** In the system prompt; the fake provider looks for it. */
export const READINESS_MARKER = 'Answer with the readiness review for one area as JSON and nothing else.';
const MAX_FILE = 100 * 1024;
const MAX_TOTAL = 200 * 1024;
const MAX_NAMES = 2000;
const TIMEOUT_MS = 120_000;

/** The areas whose review reads the ticked AI files; the others get names only. */
const READS_FILES: Area[] = ['Agent instructions', 'Conventions', 'Agent tooling'];

const clip = (max: number) => z.string().min(1).transform((v) => (v.length > max ? `${v.slice(0, max - 1)}…` : v));
const evidence = z.object({ path: z.string().min(1).max(300), line: z.number().int().positive().optional() });
export const answerSchema = z.object({
  why: z.array(z.object({ rule: z.string(), text: clip(400) })).max(12).default([]),
  findings: z.array(z.object({ summary: clip(300), evidence: z.array(evidence).max(5).default([]), lowersRating: z.boolean().default(false) })).max(3).default([]),
  advice: z.array(z.object({
    title: clip(160), why: clip(500), evidence: z.array(evidence).max(5).default([]),
    impact: z.enum(['High', 'Medium', 'Low']), effort: z.enum(['Small', 'Medium', 'Large']), action: z.enum(['add', 'adopt']).default('add'),
  })).max(3).default([]),
});
export type AreaAnswer = z.infer<typeof answerSchema>;

/** The AI files the user may tick for the model to read: agent files, rule folders, subagents, skills, standards. */
export function readableFiles(scan: ReadinessScan): { path: string; size: number; ticked: boolean; blocked: boolean }[] {
  const ai = scan.facts.files.filter((f) => /^(AGENTS\.md|CLAUDE\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|\.github\/copilot-instructions\.md)$/.test(f)
    || /^(\.cursor|\.claude|\.keel\/standards|\.github\/agents|\.kiro\/steering)\//.test(f)).sort();
  return ai.map((path) => {
    let size = 0;
    try {
      size = statSync(join(scan.root, path)).size;
    } catch { /* gone */ }
    const blocked = mayHoldKeys(path) || !/\.(md|mdc|txt)$|rules$/i.test(path);
    return { path, size, blocked, ticked: !blocked && /^(AGENTS\.md|CLAUDE\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|\.github\/copilot-instructions\.md)$/.test(path) };
  });
}

/** The ticked files' text, only those that may be ticked, capped like the baseline: 100 KB each, 200 KB in all. */
export function tickedTexts(scan: ReadinessScan, ticked: string[]): { path: string; text: string }[] {
  const allowed = new Set(readableFiles(scan).filter((f) => !f.blocked).map((f) => f.path));
  let total = 0;
  return ticked.filter((p) => allowed.has(p)).flatMap((path) => {
    const text = readFileSync(join(scan.root, path), 'utf8').slice(0, MAX_FILE);
    if (total + text.length > MAX_TOTAL) return [];
    total += text.length;
    return [{ path, text }];
  });
}

export function areaMessages(area: Area, input: Record<string, unknown>) {
  return [
    {
      role: 'system' as const,
      content: [
        `You review how ready a software folder is for coding agents, for one area: ${area}.`,
        'Rules already ran on the folder. For each failed rule, say in one or two sentences why it matters for this project.',
        'Add at most three findings and three pieces of advice the rules missed. Every finding and piece of advice names the files it is based on, from the file names given; never name a file that is not in the list.',
        'A finding may set lowersRating when it shows the area is weaker than the rules say. Impact is High, Medium or Low; effort is Small, Medium or Large; action is "add" (Keel creates or changes something) or "adopt" (keep what is there and use it).',
        READINESS_MARKER,
        'Format: {"why": [{"rule": "AI-03", "text": "..."}], "findings": [{"summary": "...", "evidence": [{"path": "AGENTS.md", "line": 4}], "lowersRating": false}], "advice": [{"title": "...", "why": "...", "evidence": [{"path": "..."}], "impact": "High", "effort": "Small", "action": "add"}]}',
      ].join('\n'),
    },
    { role: 'user' as const, content: JSON.stringify(input) },
  ];
}

function parse(text: string | undefined): AreaAnswer | undefined {
  if (!text) return undefined;
  try {
    const parsed = answerSchema.safeParse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((done) => { timer = setTimeout(() => done('timeout'), ms); });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export type AreaReview = { ok: true; answer: AreaAnswer } | { ok: false; reason: string };

/** One area: the call, retried once when the answer is not valid JSON in the format. */
export async function reviewArea(write: Writer, area: Area, input: Record<string, unknown>, timeoutMs = TIMEOUT_MS): Promise<AreaReview> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await withTimeout(write('feasibility', areaMessages(area, input)), timeoutMs);
    if (text === 'timeout') return { ok: false, reason: `no answer within ${Math.round(timeoutMs / 1000)} s` };
    if (text === undefined) return { ok: false, reason: 'the model did not answer (check Settings › Model per task)' };
    const answer = parse(text);
    if (answer) return { ok: true, answer };
  }
  return { ok: false, reason: 'the model\'s answer was not in the expected format, twice' };
}

/** What the call for one area sends: names, the area's rule results and, for AI-file areas, the ticked files. */
export function areaInput(area: Area, scan: ReadinessScan, results: RuleResult[], files: { path: string; text: string }[]): Record<string, unknown> {
  return {
    folderCase: scan.kase,
    names: scan.facts.files.slice(0, MAX_NAMES),
    rules: results.filter((r) => r.area === area).map((r) => {
      const rule = ruleById(r.rule);
      return { id: r.rule, status: r.status, passesWhen: rule?.passesWhen, advice: rule ? adviceTitle(rule, r.params) : undefined, evidence: r.evidence };
    }),
    files: READS_FILES.includes(area) ? files : [],
  };
}

export interface ModelReview { answers: Partial<Record<Area, AreaAnswer>>; error?: string }

/** Every area in turn; stops at the first failure and keeps the areas already reviewed. */
export async function reviewAreas(write: Writer, scan: ReadinessScan, results: RuleResult[], files: { path: string; text: string }[], onArea?: (area: Area, index: number) => void, timeoutMs = TIMEOUT_MS): Promise<ModelReview> {
  const answers: ModelReview['answers'] = {};
  for (const [index, area] of AREAS.entries()) {
    onArea?.(area, index);
    const review = await reviewArea(write, area, areaInput(area, scan, results, files), timeoutMs);
    if (!review.ok) return { answers, error: review.reason };
    answers[area] = review.answer;
  }
  return { answers };
}
