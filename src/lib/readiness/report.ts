// The AI readiness report (CR-0015): built from the rule results and the grounded model review, written from the
// template readiness-report@1, saved and compared. A report holds names, ratings, advice and choices; never file
// contents and never secret values. In a Keel folder it is a Keel commit in .keel/reports/; before Initialise it is
// kept in the user config folder, under reports/<folder id>/, and Initialise moves it into the project.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { fillSections } from '../brainstorm/sections';
import { fail, ok, type Result } from '../result';
import { writeFileAtomic } from '../store/atomic';
import { commitFiles } from '../store/git';
import type { Store } from '../store/store';
import { isInitialised, readProject } from '../store/workspace';
import { renderTemplate } from '../templates/render';
import { chosenTemplate, seedDir } from '../templates/library';
import { ground } from './grounding';
import type { MappingRow } from './mapping';
import type { AreaAnswer, ModelReview } from './review';
import { adviceTitle, AREAS, areaRating, ruleById, RULES, type Area, type Effort, type Evidence, type Impact, type Rating, type ReadinessScan, type RuleResult } from './rules';

export const REPORTS_DIR = '.keel/reports';
export const REPORT_TEMPLATE = 'readiness-report@1';

export type Choice = 'add' | 'adopt' | 'ignore';
export type Source = 'Scan' | 'Model review';

export interface AreaResult { area: Area; rating: Rating; summary: string; evidence: Evidence[]; source: Source }
export interface Advice { id: string; title: string; area: Area; why: string; evidence: Evidence[]; impact: Impact; effort: Effort; source: Source; rule?: string; action: 'add' | 'adopt'; choice: Choice }
export interface ReadinessReport {
  id: string;                 // readiness-2026-11-22, readiness-2026-11-22-2
  title: string;
  date: string;               // ISO timestamp
  folderCase: ReadinessScan['kase'];
  model: string;
  durationMs: number;
  read: string[];             // names of the files the model read
  areas: AreaResult[];
  mapping: MappingRow[];
  advice: Advice[];
  hidden: string[];           // advice IDs ignored in an earlier report and left out of this one
  modelError?: string;
}

const IMPACT_ORDER: Record<Impact, number> = { High: 0, Medium: 1, Low: 2 };
const evidenceSchema = z.object({ path: z.string(), line: z.number().int().optional() });
const reportSchema = z.object({
  id: z.string().regex(/^readiness-\d{4}-\d{2}-\d{2}(-\d+)?$/), title: z.string().default(''), date: z.string(),
  folder_case: z.enum(['new', 'keel', 'existing', 'existing-ai']), model: z.string().default(''), duration_ms: z.number().default(0),
  read: z.array(z.string()).default([]),
  areas: z.array(z.object({ area: z.enum(AREAS), rating: z.enum(['Ready', 'Partly', 'Missing']), summary: z.string().default(''), evidence: z.array(evidenceSchema).default([]), source: z.enum(['Scan', 'Model review']).default('Scan') })),
  mapping: z.array(z.object({ file: z.string(), keel: z.string(), proposal: z.enum(['Keep', 'Point to', 'Adopt']), note: z.string().default('') })).default([]),
  advice: z.array(z.object({
    id: z.string(), title: z.string(), area: z.enum(AREAS), why: z.string().default(''), evidence: z.array(evidenceSchema).default([]),
    impact: z.enum(['High', 'Medium', 'Low']), effort: z.enum(['Small', 'Medium', 'Large']), source: z.enum(['Scan', 'Model review']),
    rule: z.string().optional(), action: z.enum(['add', 'adopt']).default('add'), choice: z.enum(['add', 'adopt', 'ignore']).default('add'),
  })).default([]),
  hidden: z.array(z.string()).default([]),
  model_error: z.string().optional(),
});

/** A stable ID for model advice: the same area, title and files give the same ID in the next report. */
export function modelAdviceId(area: Area, title: string, evidence: Evidence[]): string {
  return `M-${createHash('sha1').update([area, title.trim().toLowerCase(), ...evidence.map((e) => e.path).sort()].join('|')).digest('hex').slice(0, 8)}`;
}

export interface BuildInput {
  scan: ReadinessScan;
  results: RuleResult[];
  mapping: MappingRow[];
  review: ModelReview;
  model: string;
  durationMs: number;
  read: string[];
  ignored: string[];
  lineCount: (path: string) => number | undefined;
  now: Date;
  id: string;
  title: string;
}

/** The report from the rule results and the model's answers, grounded against the scan. */
export function buildReport(input: BuildInput): ReadinessReport {
  const { scan, results } = input;
  const files = new Set(scan.facts.files);
  const advice: Advice[] = [];
  const areas: AreaResult[] = AREAS.map((area) => {
    const rated = areaRating(results, area);
    const answer: AreaAnswer = input.review.answers[area] ?? { why: [], findings: [], advice: [] };
    const grounded = ground(area, answer, results, rated, files, input.lineCount);
    const failed = results.filter((r) => r.area === area && r.status === 'fail');
    const lowered = grounded.rating !== rated;
    for (const r of failed) {
      const rule = ruleById(r.rule);
      if (!rule || scan.kase === 'new') continue;
      advice.push({
        id: r.rule, title: adviceTitle(rule, r.params), area, why: grounded.answer.why.find((w) => w.rule === r.rule)?.text ?? rule.advice.why,
        evidence: r.evidence, impact: rule.advice.impact, effort: rule.advice.effort, source: 'Scan', rule: r.rule, action: rule.advice.action, choice: rule.advice.action,
      });
    }
    for (const a of grounded.answer.advice) {
      advice.push({ id: modelAdviceId(area, a.title, a.evidence), title: a.title, area, why: a.why, evidence: a.evidence, impact: a.impact, effort: a.effort, source: 'Model review', action: a.action, choice: a.action });
    }
    const finding = grounded.answer.findings[0];
    const summary = lowered && finding ? finding.summary
      : failed.length ? failed.slice(0, 2).map((r) => { const rule = ruleById(r.rule); return rule ? adviceTitle(rule, r.params) : r.rule; }).join('; ')
      : finding?.summary ?? 'Every check passes';
    const evidence = (failed.length ? failed : results.filter((r) => r.area === area && r.status === 'pass')).flatMap((r) => r.evidence).slice(0, 4);
    return { area, rating: grounded.rating, summary, evidence: lowered && finding ? finding.evidence : evidence, source: lowered ? 'Model review' : 'Scan' };
  });
  if (scan.kase === 'new') {
    advice.push({ id: 'INIT', title: 'Initialise the folder with Keel', area: 'Agent instructions', why: 'The folder is empty: Keel sets up agent instructions, requirements, scenarios and standards from the start.', evidence: [], impact: 'High', effort: 'Small', source: 'Scan', action: 'add', choice: 'add' });
  }
  const order = (a: Advice) => (a.rule ? RULES.findIndex((r) => r.id === a.rule) : RULES.length);
  const sorted = advice.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || order(a) - order(b));
  return {
    id: input.id, title: input.title, date: input.now.toISOString(), folderCase: scan.kase, model: input.model, durationMs: input.durationMs,
    read: input.read, areas, mapping: input.mapping,
    advice: sorted.filter((a) => !input.ignored.includes(a.id)), hidden: sorted.filter((a) => input.ignored.includes(a.id)).map((a) => a.id),
    ...(input.review.error ? { modelError: input.review.error } : {}),
  };
}

const count = (report: ReadinessReport, rating: Rating) => report.areas.filter((a) => a.rating === rating).length;
const where = (evidence: Evidence[]) => evidence.map((e) => `\`${e.path}${e.line ? `:${e.line}` : ''}\``).join(', ') || '—';
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The report as markdown from the chosen readiness template (the seed one before Initialise). */
export function renderReport(root: string, report: ReadinessReport): { text: string; template: string } {
  const project = isInitialised(root) ? readProject(root) : undefined;
  const chosen = isInitialised(root) ? chosenTemplate(root, 'readiness-report', project?.ok ? project.value.templates : {}) : undefined;
  const template = chosen ?? { ref: REPORT_TEMPLATE, content: readFileSync(join(seedDir(), 'templates', 'readiness-report.md'), 'utf8') };
  const body = fillSections(renderTemplate(template.content, {
    project_title: report.title, ready: String(count(report, 'Ready')), partly: String(count(report, 'Partly')), missing: String(count(report, 'Missing')),
    advice_count: String(report.advice.length), high_count: String(report.advice.filter((a) => a.impact === 'High').length),
  }).body, {
    Areas: [['| Area | Rating | Finding | Based on | Source |', '| --- | --- | --- | --- | --- |', ...report.areas.map((a) => `| ${a.area} | ${a.rating} | ${cell(a.summary)} | ${where(a.evidence)} | ${a.source} |`)].join('\n')],
    'Your AI files and the Keel standard': [report.mapping.length ? ['| Your file | Keel | Proposal | Note |', '| --- | --- | --- | --- |', ...report.mapping.map((m) => `| \`${m.file}\` | ${m.keel} | ${m.proposal} | ${cell(m.note)} |`)].join('\n') : 'No AI files in this folder.'],
    Advice: [report.advice.length ? report.advice.map((a, i) => `${i + 1}. **${a.title}** (${a.area}; ${a.impact} impact, ${a.effort} effort; ${a.source}; ${a.choice === 'ignore' ? 'Ignore' : a.choice === 'adopt' ? 'Adopt' : 'Add'})\n   ${a.why} Based on: ${where(a.evidence)}.`).join('\n') : 'No advice.'],
    'Model review': [report.modelError ? `The model review did not finish: ${report.modelError}` : `${report.model || 'No model'}, ${Math.round(report.durationMs / 100) / 10} s. Read: ${report.read.length ? report.read.map((r) => `\`${r}\``).join(', ') : 'file and folder names only'}.`],
  });
  const header = {
    template: template.ref, id: report.id, title: report.title, date: report.date, folder_case: report.folderCase, model: report.model, duration_ms: report.durationMs,
    read: report.read, areas: report.areas, mapping: report.mapping, advice: report.advice, hidden: report.hidden, ...(report.modelError ? { model_error: report.modelError } : {}),
  };
  return { text: matter.stringify(body, JSON.parse(JSON.stringify(header)) as Record<string, unknown>), template: template.ref };
}

export function parseReport(text: string): ReadinessReport | undefined {
  try {
    const parsed = reportSchema.safeParse(matter(text, {}).data);
    if (!parsed.success) return undefined;
    const d = parsed.data;
    return {
      id: d.id, title: d.title, date: d.date, folderCase: d.folder_case, model: d.model, durationMs: d.duration_ms, read: d.read, areas: d.areas,
      mapping: d.mapping, advice: d.advice, hidden: d.hidden, ...(d.model_error ? { modelError: d.model_error } : {}),
    };
  } catch {
    return undefined;
  }
}

/** A stable ID for a folder, for keeping its reports in the user config folder before Initialise. */
export function folderId(root: string): string {
  let real = root;
  try {
    real = realpathSync(root);
  } catch { /* keep the path */ }
  return createHash('sha1').update(real).digest('hex').slice(0, 12);
}

/** Where this folder's reports are: .keel/reports when initialised, the user config folder otherwise. */
export function reportsDir(store: Pick<Store, 'root' | 'user'>): { dir: string; inProject: boolean } {
  return isInitialised(store.root) ? { dir: join(store.root, REPORTS_DIR), inProject: true } : { dir: join(store.user, 'reports', folderId(store.root)), inProject: false };
}

/** The folder's reports, newest first. */
export function listReports(store: Pick<Store, 'root' | 'user'>): ReadinessReport[] {
  const { dir } = reportsDir(store);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^readiness-.*\.md$/.test(f))
    .flatMap((f) => { const r = parseReport(readFileSync(join(dir, f), 'utf8')); return r ? [r] : []; })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function readReport(store: Pick<Store, 'root' | 'user'>, id: string): ReadinessReport | undefined {
  if (!/^readiness-\d{4}-\d{2}-\d{2}(-\d+)?$/.test(id)) return undefined;
  const file = join(reportsDir(store).dir, `${id}.md`);
  return existsSync(file) ? parseReport(readFileSync(file, 'utf8')) : undefined;
}

/** readiness-YYYY-MM-DD, then -2, -3 … on the same day. */
export function nextReportId(store: Pick<Store, 'root' | 'user'>, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  const { dir } = reportsDir(store);
  const taken = existsSync(dir) ? readdirSync(dir) : [];
  let id = `readiness-${day}`;
  for (let n = 2; taken.includes(`${id}.md`); n += 1) id = `readiness-${day}-${n}`;
  return id;
}

/** Advice IDs the latest report says to ignore, hidden in the next one. */
export function ignoredAdvice(store: Pick<Store, 'root' | 'user'>): string[] {
  const latest = listReports(store)[0];
  return latest ? [...latest.hidden, ...latest.advice.filter((a) => a.choice === 'ignore').map((a) => a.id)] : [];
}

/** Writes the report; in a Keel folder as a Keel commit. */
export async function saveReport(store: Store, report: ReadinessReport, message = `AI readiness report ${report.id}`): Promise<Result<string, 'failed'>> {
  const { dir, inProject } = reportsDir(store);
  const { text } = renderReport(store.root, report);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileAtomic(join(dir, `${report.id}.md`), text);
    if (!inProject) return ok(join(dir, `${report.id}.md`));
    const path = `${REPORTS_DIR}/${report.id}.md`;
    await commitFiles(store.root, [path], message);
    return ok(path);
  } catch (error) {
    return fail('failed', `Could not save the report: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}`);
  }
}

/** The choices for each piece of advice, saved in the report (one Keel commit in a Keel folder). */
export async function saveChoices(store: Store, id: string, choices: Record<string, Choice>): Promise<Result<ReadinessReport, 'not-found' | 'failed'>> {
  const report = readReport(store, id);
  if (!report) return fail('not-found', `No report ${id}`);
  const updated = { ...report, advice: report.advice.map((a) => ({ ...a, choice: choices[a.id] ?? a.choice })) };
  const saved = await saveReport(store, updated, `AI readiness report ${id}: advice choices`);
  return saved.ok ? ok(updated) : saved;
}

/** Reports kept in the user config folder before Initialise, as files for .keel/reports (Initialise writes and commits them). */
export function userReportFiles(store: Pick<Store, 'root' | 'user'>): { path: string; content: string }[] {
  const from = join(store.user, 'reports', folderId(store.root));
  if (!existsSync(from)) return [];
  return readdirSync(from).filter((f) => /^readiness-.*\.md$/.test(f)).map((f) => ({ path: `${REPORTS_DIR}/${f}`, content: readFileSync(join(from, f), 'utf8') }));
}

/** After Initialise took them in: removes the folder's reports from the user config folder. */
export function clearUserReports(store: Pick<Store, 'root' | 'user'>): void {
  rmSync(join(store.user, 'reports', folderId(store.root)), { recursive: true, force: true });
}

export interface Comparison { ratings: { area: Area; from: Rating; to: Rating }[]; added: string[]; gone: string[] }

/** What changed between an earlier report and a later one: ratings, and advice that appeared or went away. */
export function compareReports(earlier: ReadinessReport, later: ReadinessReport): Comparison {
  const ratings = AREAS.flatMap((area) => {
    const from = earlier.areas.find((a) => a.area === area)?.rating;
    const to = later.areas.find((a) => a.area === area)?.rating;
    return from && to && from !== to ? [{ area, from, to }] : [];
  });
  const before = new Set([...earlier.advice.map((a) => a.id), ...earlier.hidden]);
  const after = new Set([...later.advice.map((a) => a.id), ...later.hidden]);
  return {
    ratings,
    added: later.advice.filter((a) => !before.has(a.id)).map((a) => a.title),
    gone: earlier.advice.filter((a) => !after.has(a.id)).map((a) => a.title),
  };
}
