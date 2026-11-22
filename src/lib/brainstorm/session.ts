// Explore (REQ-001, REQ-011, task R10): the intent template's sections, filled in by the user, with a comment
// from the assistant on each one. Kept in .keel/brainstorm/INT-0001.json: saved on every change, committed
// only when the intent is drafted or a change request is saved (owner decision 2). The assistant never
// changes text the user wrote: it fills empty sections as suggestions and offers rewrites in its comments.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import { previewRoot } from '../seed';
import { writeFileAtomic } from '../store/atomic';
import type { Store } from '../store/db';
import { commitFiles } from '../store/git';
import { initialiseProject, isInitialised, readProject, updateConfig } from '../store/workspace';
import { parseTemplateRef, readTemplate, templateName } from '../templates/library';
import { readStandard } from '../standards/library';
import { parseSections, type Section } from './sections';
import { readStyle, type Style } from './styles';

/** Repository path of Explore's state; the template library reads the template from it. */
export const EXPLORE_FILE = '.keel/brainstorm/INT-0001.json';
/** Where CR-0004 kept the brainstorm; converted once (owner decision 2). */
export const LEGACY_FILE = '.keel/brainstorm/explore.md';

const origin = z.enum(['user', 'suggested', 'accepted']);
const rowSchema = z.object({ id: z.string().regex(/^REQ-\d{3,}$/).optional(), text: z.string(), origin });
const rewrite = z.string().max(20_000);
const commentSchema = z.object({
  kind: z.enum(['challenge', 'link', 'suggest', 'ask', 'ok']),
  text: z.string().max(2_000),
  linkTo: z.string().optional(),     // the section a cross-reference points at
  rewrite: rewrite.optional(),       // text the user can apply to this section
  addRow: z.string().max(2_000).optional(),   // Requirements: a row the user can add
  dismissed: z.boolean().optional(),
  applied: z.boolean().optional(),
});
const threadSchema = z.object({ from: z.enum(['user', 'assistant']), text: z.string(), rewrite: rewrite.optional(), applied: z.boolean().optional() });
const sectionSchema = z.object({
  key: z.string(),
  value: z.string().default(''),
  rows: z.array(rowSchema).optional(),
  origin: origin.default('user'),
  cleared: z.boolean().optional(),
  reviewedHash: z.string().optional(),
  comment: commentSchema.optional(),
  commentAt: z.string().optional(),   // when the comment last changed, for the "New comment" tag
  thread: z.array(threadSchema).default([]),
});
const exploreSchema = z.object({
  title: z.string().min(1),
  idea: z.string().default(''),
  template: z.string(),
  style: z.string(),
  sections: z.array(sectionSchema),
  reviewedAt: z.string().optional(),
  drafted: z.record(z.string(), z.string()).optional(),   // section text as it went into the last draft
  changeRequest: z.string().optional(),   // after approval: the change request the edits are saved in
});

export type Origin = z.infer<typeof origin>;
export type Row = z.infer<typeof rowSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type ThreadEntry = z.infer<typeof threadSchema>;
export type SectionState = z.infer<typeof sectionSchema>;
export type Explore = z.infer<typeof exploreSchema>;

export type BrainstormError =
  | 'invalid-input' | 'not-found' | 'invalid-file' | 'unknown-template' | 'unknown-style'
  | 'unknown-section' | 'not-ready' | 'intent-locked' | 'not-approved' | 'no-change' | 'repo-busy';

/** Explore's state with its template sections and style. */
export interface Context {
  state: Explore;
  sections: Section[];
  style: Style;
  templateContent: string;
}

/** True when the text counts for the gate: written or accepted by the user. Suggestions do not count. */
export function counts(section: SectionState): boolean {
  if (section.rows) return section.rows.some((r) => r.origin !== 'suggested' && r.text.trim() !== '');
  return section.origin !== 'suggested' && section.value.trim() !== '';
}

/** A section's state; an empty one when the template has a section the state does not have yet. */
export function sectionOf(state: Explore, key: string, list = false): SectionState {
  return state.sections.find((s) => s.key === key) ?? { key, value: '', origin: 'user', thread: [], ...(list ? { rows: [] } : {}) };
}

/** Every required section, Requirements included, has text the user wrote or accepted (REQ-005). */
export function requiredFilled(context: Pick<Context, 'state' | 'sections'>): boolean {
  return context.sections.filter((s) => s.required).every((s) => counts(sectionOf(context.state, s.heading, s.list)));
}

/** Fingerprint of what the assistant reviews in a section. */
export function fingerprint(section: SectionState): string {
  const content = section.rows ? section.rows.map((r) => `${r.origin}:${r.text}`).join('\n') : `${section.origin}:${section.value}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** True when some section changed since the assistant last reviewed it. */
export function needsReview(context: Pick<Context, 'state' | 'sections'>): boolean {
  return context.sections.some((s) => {
    const section = sectionOf(context.state, s.heading, s.list);
    return section.reviewedHash !== fingerprint(section);
  });
}

function emptyState(input: { title: string; idea: string; template: string; style: string }, sections: Section[]): Explore {
  return {
    title: input.title, idea: input.idea, template: input.template, style: input.style,
    sections: sections.map((s) => ({ key: s.heading, value: '', origin: 'user' as const, thread: [], ...(s.list ? { rows: [] } : {}) })),
  };
}

function serialise(state: Explore): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export interface NewIdea {
  title: string;
  idea: string;
  author: string;
  template: string;  // e.g. standard-intent@4
  style: string;     // e.g. challenger@1
  standards?: string[];
  templates?: { spec?: string; plan?: string };
  extra?: Record<string, unknown>;                   // further config fields, e.g. agent_files_at_start (CR-0010)
  projectStandard?: { ref: string; path: string; content: string };   // a standard made from the folder's own rules
}

/**
 * Initialise and start: writes .keel/ with config, libraries and Explore's empty sections as one commit.
 * The choices are checked against the seed library, since .keel/ does not exist yet.
 */
export async function startIdea(store: Store, input: NewIdea): Promise<Result<Explore, BrainstormError>> {
  if (!input.title.trim() || !input.author.trim()) return fail('invalid-input', 'A title and your name are needed');
  if (isInitialised(store.root)) return fail('invalid-input', 'This folder is already initialised');
  const library = previewRoot();
  const sections = loadSetup(library, input);
  if (!sections.ok) return sections;
  const unknown = (input.standards ?? []).filter((ref) => ref !== input.projectStandard?.ref && !readStandard(library, ref).ok);
  if (unknown.length > 0) return fail('invalid-input', `Unknown standard ${unknown.join(', ')}`);
  const state = emptyState({ title: input.title.trim(), idea: input.idea.trim(), template: input.template, style: input.style }, sections.value);
  const project = await initialiseProject(store, {
    title: state.title, description: state.idea, author: input.author,
    templates: Object.fromEntries(Object.entries({ intent: input.template, ...input.templates }).filter(([, v]) => v)),
    style: input.style, standards: [...(input.standards ?? []), ...(input.projectStandard ? [input.projectStandard.ref] : [])],
    ...(input.extra ? { extra: input.extra } : {}),
    files: [{ path: EXPLORE_FILE, content: serialise(state) }, ...(input.projectStandard ? [{ path: input.projectStandard.path, content: input.projectStandard.content }] : [])],
  });
  if (!project.ok) return fail('invalid-input', project.message);
  return ok(state);
}

/** Converts CR-0004's explore.md: its answers become the user's text (owner decision 2). */
function fromLegacy(text: string): Explore | undefined {
  const data = z.looseObject({ title: z.string(), idea: z.string().default(''), template: z.string(), brainstorm_style: z.string(), answers: z.record(z.string(), z.array(z.string())).default({}) })
    .safeParse(matter(text, {}).data);
  if (!data.success) return undefined;
  const { title, idea, template, brainstorm_style: style, answers } = data.data;
  return {
    title, idea, template, style,
    sections: Object.entries(answers).map(([key, values]) => {
      const joined = values.map((v) => v.trim()).filter(Boolean).join('\n\n');
      if (key !== 'Requirements') return { key, value: joined, origin: 'user' as const, thread: [] };
      const rows = joined.split('\n').map((l) => l.replace(/^\s*[-*]\s*(REQ-\d{3,}\s+)?/, '').trim()).filter(Boolean);
      return { key, value: '', rows: rows.map((r) => ({ text: r, origin: 'user' as const })), origin: 'user' as const, thread: [] };
    }),
  };
}

/** Explore's state from the folder; CR-0004's explore.md is read once and saved in the new form. */
export function readExplore(store: Pick<Store, 'root'>): Result<Explore, BrainstormError> {
  const file = join(store.root, EXPLORE_FILE);
  if (existsSync(file)) {
    try {
      const parsed = exploreSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      return parsed.success ? ok(parsed.data) : fail('invalid-file', z.prettifyError(parsed.error));
    } catch {
      return fail('invalid-file', `${EXPLORE_FILE} is not valid JSON`);
    }
  }
  const legacy = join(store.root, LEGACY_FILE);
  if (existsSync(legacy)) {
    const converted = fromLegacy(readFileSync(legacy, 'utf8'));
    if (!converted) return fail('invalid-file', `${LEGACY_FILE} could not be converted`);
    writeExplore(store, converted);
    return ok(converted);
  }
  return fail('not-found', 'No brainstorm yet');
}

/** Saves Explore's state. No commit: that happens when the intent is drafted (owner decision 2). */
export function writeExplore(store: Pick<Store, 'root'>, state: Explore): void {
  const file = join(store.root, EXPLORE_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileAtomic(file, serialise(state));
}

/** The state with its template sections and style. Sections are listed in template order. */
export function loadContext(store: Pick<Store, 'root'>): Result<Context, BrainstormError> {
  const state = readExplore(store);
  if (!state.ok) return state;
  const template = loadTemplate(store.root, state.value.template);
  if (!template.ok) return template;
  const style = readStyle(store.root, state.value.style);
  if (!style.ok) return fail('unknown-style', style.message);
  const sections = parseSections(template.value);
  const ordered = sections.map((s) => sectionOf(state.value, s.heading, s.list));
  const extra = state.value.sections.filter((s) => !sections.some((t) => t.heading === s.key));
  return ok({ state: { ...state.value, sections: [...ordered, ...extra] }, sections, style: style.value, templateContent: template.value });
}

export interface SectionEdit {
  key: string;
  value?: string;
  rows?: { id?: string; text: string; origin?: Origin }[];
}

/**
 * The user's edits. A changed value becomes the user's own text; emptying a suggestion counts as Clear, so
 * the assistant does not fill that section again. Rows keep their ID; an edited suggested row becomes the user's.
 */
export function applyEdits(context: Context, edits: SectionEdit[]): Result<Explore, BrainstormError> {
  const state = structuredClone(context.state);
  for (const edit of edits) {
    const template = context.sections.find((s) => s.heading === edit.key);
    if (!template) return fail('unknown-section', `No section ${edit.key}`);
    const current = sectionOf(state, edit.key, template.list);
    const next: SectionState = { ...current };
    if (template.list && edit.rows) {
      next.rows = edit.rows.map((row, i) => {
        const before = row.id ? current.rows?.find((r) => r.id === row.id) : current.rows?.[i];
        const changed = !before || before.text !== row.text;
        const rowOrigin: Origin = changed ? 'user' : (before?.origin ?? 'user');
        return { ...(row.id ? { id: row.id } : {}), text: row.text, origin: rowOrigin };
      });
    } else if (!template.list && edit.value !== undefined && (edit.value !== current.value || current.origin === 'suggested')) {
      // The user typed here: the text is theirs, even when it matches the suggestion word for word.
      if (edit.value.trim() === '' && current.origin === 'suggested') next.cleared = true;
      next.value = edit.value;
      next.origin = 'user';
    }
    replaceSection(state, next);
  }
  return ok(state);
}

function replaceSection(state: Explore, section: SectionState): void {
  const at = state.sections.findIndex((s) => s.key === section.key);
  if (at >= 0) state.sections[at] = section;
  else state.sections.push(section);
}

export type SectionAction =
  | { op: 'accept'; key: string; row?: number }
  | { op: 'clear'; key: string; row?: number }
  | { op: 'apply'; key: string; thread?: number }
  | { op: 'dismiss'; key: string }
  | { op: 'add-row'; key: string };

/**
 * Accept or Clear a suggestion, Apply a rewrite offered in a comment or a reply (to the comment's section, or for
 * a cross-reference to the section it names), Dismiss a comment, or add the row a Requirements comment offers.
 */
export function applyAction(context: Context, action: SectionAction): Result<Explore, BrainstormError> {
  const state = structuredClone(context.state);
  const template = context.sections.find((s) => s.heading === action.key);
  if (!template) return fail('unknown-section', `No section ${action.key}`);
  const section = { ...sectionOf(state, action.key, template.list) };
  if (action.op === 'accept' || action.op === 'clear') {
    if (template.list) {
      const rows = [...(section.rows ?? [])];
      const picked = action.row === undefined ? rows.map((r, i) => (r.origin === 'suggested' ? i : -1)).filter((i) => i >= 0) : [action.row];
      if (action.op === 'accept') {
        section.rows = rows.map((r, i) => (picked.includes(i) && r.origin === 'suggested' ? { ...r, origin: 'accepted' as const } : r));
      } else {
        section.rows = rows.filter((r, i) => !(picked.includes(i) && r.origin === 'suggested'));
        section.cleared = true;
      }
    } else if (section.origin === 'suggested') {
      if (action.op === 'accept') section.origin = 'accepted';
      else Object.assign(section, { value: '', origin: 'user', cleared: true });
    }
  } else if (action.op === 'apply') {
    const offer = action.thread === undefined ? section.comment?.rewrite : section.thread[action.thread]?.rewrite;
    if (offer === undefined) return fail('no-change', 'Nothing to apply');
    if (template.list) section.rows = offer.split('\n').map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean).map((text) => ({ text, origin: 'accepted' as const }));
    else Object.assign(section, { value: offer, origin: 'accepted' });
    if (action.thread === undefined && section.comment) section.comment = { ...section.comment, applied: true };
    else if (action.thread !== undefined) section.thread = section.thread.map((t, i) => (i === action.thread ? { ...t, applied: true } : t));
  } else if (action.op === 'dismiss') {
    if (section.comment) section.comment = { ...section.comment, dismissed: true };
  } else if (action.op === 'add-row') {
    const row = section.comment?.addRow;
    if (!template.list || !row) return fail('no-change', 'Nothing to add');
    section.rows = [...(section.rows ?? []), { text: row, origin: 'accepted' }];
    if (section.comment) section.comment = { ...section.comment, applied: true };
  }
  replaceSection(state, section);
  return ok(state);
}

/** A brainstorm for documents Keel adopts (task R9): each template section with text in intent.md is the user's. */
export function exploreFromIntent(input: { title: string; idea: string; template: string; style: string; intentBody: string; templateContent: string }): Explore {
  const sections = parseSections(input.templateContent);
  const state = emptyState(input, sections);
  for (const { heading, list } of sections) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^## ${escaped}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(input.intentBody);
    const text = (match?.[1] ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();
    if (!text || text === '_Not written yet._') continue;
    const section = sectionOf(state, heading, list);
    if (list) {
      section.rows = text.split('\n')
        .map((l) => /^\s*[-*]\s*(?:(REQ-\d{3,})\s+)?(.*)$/.exec(l))
        .filter((m): m is RegExpExecArray => Boolean(m?.[2]?.trim()))
        .map((m) => ({ ...(m[1] ? { id: m[1] } : {}), text: (m[2] ?? '').trim(), origin: 'user' as const }));
    } else section.value = text;
    replaceSection(state, section);
  }
  state.drafted = Object.fromEntries(state.sections.map((s) => [s.key, sectionText(s)]));
  return state;
}

/** A section's text as it goes into intent.md (rows as "- REQ-001 text"), for diffs and drafts. */
export function sectionText(section: SectionState): string {
  if (section.rows) return section.rows.filter((r) => r.origin !== 'suggested' && r.text.trim()).map((r) => `- ${r.id ? `${r.id} ` : ''}${r.text.trim()}`).join('\n');
  return section.origin === 'suggested' ? '' : section.value.trim();
}

/** Project setup: changes the template or style. Sections keep their text by heading. */
export async function changeSetup(store: Store, change: { template: string; style: string }): Promise<Result<Explore, BrainstormError>> {
  const state = readExplore(store);
  if (!state.ok) return state;
  const loaded = loadSetup(store.root, change);
  if (!loaded.ok) return loaded;
  const next: Explore = { ...state.value, template: change.template, style: change.style };
  next.sections = [
    ...loaded.value.map((s) => sectionOf(state.value, s.heading, s.list)),
    ...state.value.sections.filter((s) => !loaded.value.some((t) => t.heading === s.key)),
  ];
  writeExplore(store, next);
  await commitFiles(store.root, [EXPLORE_FILE], 'Brainstorm: project setup');
  const project = readProject(store.root);
  if (project.ok) await updateConfig(store, { templates: { ...project.value.templates, intent: change.template }, style: change.style }, 'Keel: project setup');
  return ok(next);
}

export function templateLabel(ref: string): string {
  const parsed = parseTemplateRef(ref);
  return parsed ? templateName(parsed.id, parsed.version) : ref;
}

function loadTemplate(library: string, ref: string): Result<string, BrainstormError> {
  const parsed = parseTemplateRef(ref);
  const template = parsed && readTemplate(library, parsed.id, parsed.version);
  if (!template?.ok || template.value.kind !== 'intent') return fail('unknown-template', `No intent template ${ref}`);
  return ok(template.value.content);
}

/** Checks a template and style choice; the template's sections when both exist. */
function loadSetup(library: string, choice: { template: string; style: string }): Result<Section[], BrainstormError> {
  const template = loadTemplate(library, choice.template);
  if (!template.ok) return template;
  if (!readStyle(library, choice.style).ok) return fail('unknown-style', `No style ${choice.style}`);
  return ok(parseSections(template.value));
}
