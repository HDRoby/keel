// The project's brainstorm, kept in .keel/brainstorm/explore.md (REQ-001, REQ-011, ADR-0010).
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import type { ChatMessage } from '../providers/types';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { createDocument, readDocument, saveDocument, type StoredDocument } from '../store/documents';
import { writeFileAtomic } from '../store/atomic';
import { commitSquashing } from '../store/git';
import { initialiseProject, isInitialised, readProject, reserveRequirementIds, updateConfig } from '../store/workspace';
import { previewRoot } from '../seed';
import { REQUIREMENTS_SECTION, renderRequirements, requirementCandidates, unassigned } from '../trace/assign';
import { maxReqNumber } from '../trace/parse';
import { parseTemplateRef, readTemplate, templateName } from '../templates/library';
import { renderTemplate } from '../templates/render';
import { appendToSection, fillSections, isCaptured, nextQuestion, parseSections, requiredCaptured, type Question, type Section } from './sections';
import { readStyle, type Style } from './styles';
import { readStandard } from '../standards/library';

/** Repository path of the transcript; the template library reads the same path. */
export const BRAINSTORM_FILE = '.keel/brainstorm/explore.md';

const question = z.strictObject({ section: z.string(), step: z.enum(['ask', 'probe']) });
const entry = z.strictObject({ role: z.enum(['user', 'assistant']), text: z.string(), section: z.string().optional(), step: z.enum(['ask', 'probe']).optional() });
const sessionSchema = z.strictObject({
  title: z.string().min(1),
  idea: z.string(),
  template: z.string(),
  brainstorm_style: z.string(),
  answers: z.record(z.string(), z.array(z.string())),
  current: question.nullable(),
  transcript: z.array(entry),
  req_ids: z.record(z.string(), z.string()).default({}),  // requirement statement → REQ ID, never reassigned
  in_intent: z.record(z.string(), z.number()).default({}), // per section, how many answers intent.md already has
});

export type Entry = z.infer<typeof entry>;
export type Session = z.infer<typeof sessionSchema>;

export type BrainstormError =
  | 'invalid-input' | 'not-found' | 'invalid-file' | 'unknown-template' | 'unknown-style'
  | 'no-question' | 'not-ready' | 'already-drafted' | 'not-drafted' | 'intent-locked' | 'no-change';

/** Everything the brainstorm needs about its template and style. */
export interface Context {
  session: Session;
  sections: Section[];
  style: Style;
  templateContent: string;
}

export interface NewIdea {
  title: string;
  idea: string;
  author: string;
  template: string;  // e.g. standard-intent@3
  style: string;     // e.g. challenger@1
  standards?: string[];  // e.g. security-baseline@2
  templates?: { spec?: string; plan?: string };   // document templates chosen at Initialise
}

/**
 * Initialise and start: writes .keel/ with config, libraries and the brainstorm (first question pending)
 * as one commit. The choices are checked against the seed library, since .keel/ does not exist yet.
 */
export async function startIdea(store: Store, input: NewIdea): Promise<Result<Session, BrainstormError>> {
  if (!input.title.trim() || !input.author.trim()) return fail('invalid-input', 'A title and your name are needed');
  if (isInitialised(store.root)) return fail('invalid-input', 'This folder is already initialised');
  const library = previewRoot();
  const sections = loadSetup(library, input);
  if (!sections.ok) return sections;
  const unknown = (input.standards ?? []).filter((ref) => !readStandard(library, ref).ok);
  if (unknown.length > 0) return fail('invalid-input', `Unknown standard ${unknown.join(', ')}`);
  const session: Session = {
    title: input.title.trim(), idea: input.idea.trim(), template: input.template, brainstorm_style: input.style,
    answers: {}, req_ids: {}, in_intent: {}, current: nextQuestion(sections.value, {}) ?? null, transcript: [],
  };
  const project = await initialiseProject(store, {
    title: session.title, description: session.idea, author: input.author,
    templates: Object.fromEntries(Object.entries({ intent: input.template, ...input.templates }).filter(([, v]) => v)), style: input.style, standards: input.standards ?? [],
    files: [{ path: BRAINSTORM_FILE, content: sessionFile(session) }],
  });
  if (!project.ok) return fail('invalid-input', project.message);
  return ok(session);
}

export function readSession(store: Pick<Store, 'root'>): Result<Session, BrainstormError> {
  const file = join(store.root, BRAINSTORM_FILE);
  if (!existsSync(file)) return fail('not-found', 'No brainstorm yet');
  const parsed = sessionSchema.safeParse(matter(readFileSync(file, 'utf8'), {}).data);
  return parsed.success ? ok(parsed.data) : fail('invalid-file', z.prettifyError(parsed.error));
}

/** The session with its template sections and style. */
export function loadContext(store: Pick<Store, 'root'>): Result<Context, BrainstormError> {
  const session = readSession(store);
  if (!session.ok) return session;
  const template = loadTemplate(store.root, session.value.template);
  if (!template.ok) return template;
  const style = readStyle(store.root, session.value.brainstorm_style);
  if (!style.ok) return fail('unknown-style', style.message);
  return ok({ session: session.value, sections: parseSections(template.value), style: style.value, templateContent: template.value });
}

/** The question still to be asked, if the assistant has not asked it yet. */
export function pendingQuestion(session: Session): Question | undefined {
  const last = session.transcript.at(-1);
  if (!session.current) return undefined;
  const asked = last?.role === 'assistant' && last.section === session.current.section && last.step === session.current.step;
  return asked ? undefined : session.current;
}

/** Records the proposer's answer to the current question and moves to the next one. */
export async function recordAnswer(store: Store, context: Context, text: string): Promise<Result<Session, BrainstormError>> {
  const { session, sections } = context;
  const answered = session.current;
  if (!answered || pendingQuestion(session) || !text.trim()) return fail('no-question', 'There is no open question to answer');
  const answers = { ...session.answers, [answered.section]: [...(session.answers[answered.section] ?? []), text.trim()] };
  const next: Session = {
    ...session,
    answers,
    current: nextQuestion(sections, answers, answered) ?? null,
    transcript: [...session.transcript, { role: 'user', text: text.trim(), section: answered.section, step: answered.step }],
  };
  await save(store, next);
  return ok(next);
}

/**
 * Adds an answer to any section of the template without waiting for its question (owner decision, T5).
 * The open question stays open; Update intent.md picks the answer up like any other.
 */
export async function addToSection(store: Store, context: Context, heading: string, text: string): Promise<Result<Session, BrainstormError>> {
  const { session, sections } = context;
  if (!sections.some((s) => s.heading === heading)) return fail('invalid-input', `The template has no section "${heading}"`);
  const answer = text.trim();
  if (!answer) return fail('invalid-input', 'Write something to add');
  const answers = { ...session.answers, [heading]: [...(session.answers[heading] ?? []), answer] };
  // If this was the section being asked about, move past its question.
  const answeredCurrent = session.current?.section === heading && !session.answers[heading]?.length;
  const next: Session = {
    ...session,
    answers,
    current: answeredCurrent ? nextQuestion(sections, answers) ?? null : session.current,
    transcript: [...session.transcript, { role: 'user', text: answer, section: heading }],
  };
  await save(store, next);
  return ok(next);
}

/** Records the assistant's wording of the pending question. */
export async function recordQuestion(store: Store, session: Session, text: string): Promise<Result<Session, BrainstormError>> {
  const asking = pendingQuestion(session);
  if (!asking) return fail('no-question', 'No question is pending');
  const next: Session = { ...session, transcript: [...session.transcript, { role: 'assistant', text: text.trim(), ...asking }] };
  // A question alone changes nothing worth a commit: it is committed with the answer that follows.
  await save(store, next, { commit: false });
  return ok(next);
}

/** Messages for the model: the style as instructions, the section to cover, then the conversation. */
export function questionPrompt(context: Context, asking: Question): ChatMessage[] {
  const { session, sections, style } = context;
  const section = sections.find((s) => s.heading === asking.section);
  const task = asking.step === 'ask'
    ? `Ask one question so the proposer can fill the section "${asking.section}"${section?.guidance ? ` (${section.guidance})` : ''}.`
    : `Ask one follow-up question, in your style, that probes the proposer's answer for "${asking.section}".`;
  return [
    { role: 'system', content: style.instructions },
    { role: 'system', content: `The intent template is ${templateLabel(session.template)}. ${task} Reply with the question only.` },
    { role: 'user', content: `My idea: ${session.title}. ${session.idea}`.trim() },
    ...session.transcript.map((e): ChatMessage => ({ role: e.role, content: e.text })),
  ];
}

/** The question Keel asks when no model is available. */
export function fallbackQuestion(context: Context, asking: Question): string {
  const section = context.sections.find((s) => s.heading === asking.section);
  return asking.step === 'ask'
    ? `${asking.section}: ${section?.guidance || 'what should go here?'}`
    : `What would make you confident about your answer for ${asking.section}?`;
}

/** Writes intent.md from the template and the answers, recording template and style. */
export async function draftIntent(store: Store, given: Context): Promise<Result<StoredDocument, BrainstormError>> {
  if (!requiredCaptured(given.sections, given.session.answers)) return fail('not-ready', 'Every required section needs an answer first');
  const assigned = await assignRequirementIds(store, given);
  if (!assigned.ok) return assigned;
  const context = assigned.value;
  const { session } = context;
  const created = await createDocument(store, {
    kind: 'intent', title: session.title, body: intentBody(context),
    template: session.template, extra: { brainstorm_style: session.brainstorm_style },
  });
  if (!created.ok) return fail(created.error === 'already-exists' ? 'already-drafted' : 'invalid-input', created.message);
  await save(store, { ...session, in_intent: answerCounts(session) });
  return created;
}

function answerCounts(session: Session): Record<string, number> {
  return Object.fromEntries(Object.entries(session.answers).map(([h, a]) => [h, a.length]));
}

/** Answers given since intent.md last took the brainstorm, per section, as they will appear there. */
export function newAnswers(session: Session): Record<string, string[]> {
  const rendered = renderedAnswers(session);
  return Object.fromEntries(Object.entries(rendered)
    .map(([h, answers]) => [h, answers.slice(session.in_intent[h] ?? 0).filter((a) => a.trim())] as const)
    .filter(([, answers]) => answers.length > 0));
}

/** The intent body the current answers would give. */
export function intentBody(context: Context): string {
  return fillSections(renderTemplate(context.templateContent, { title: context.session.title }).body, renderedAnswers(context.session));
}

/** Answers as they appear in intent.md: requirement statements carry their REQ IDs. */
export function renderedAnswers(session: Session): Session['answers'] {
  const requirements = session.answers[REQUIREMENTS_SECTION];
  return requirements ? { ...session.answers, [REQUIREMENTS_SECTION]: renderRequirements(requirements, session.req_ids) } : session.answers;
}

/** Gives new requirement statements their IDs, reserved in project.md, and records them in the brainstorm. */
export async function assignRequirementIds(store: Store, context: Context): Promise<Result<Context, BrainstormError>> {
  const answers = context.session.answers[REQUIREMENTS_SECTION] ?? [];
  const ids = context.session.req_ids;
  const fresh = unassigned(requirementCandidates(answers), ids);
  if (fresh.length === 0) return ok(context);
  const reserved = await reserveRequirementIds(store, fresh.length, maxReqNumber(answers.join('\n')));
  if (!reserved.ok) return fail('invalid-input', reserved.message);
  const session: Session = { ...context.session, req_ids: { ...ids, ...Object.fromEntries(fresh.map((statement, i) => [statement, reserved.value[i] ?? ''])) } };
  await save(store, session);
  return ok({ ...context, session });
}

/**
 * Sections with answers given since intent.md last took the brainstorm. Edits made to intent.md
 * itself do not count. Only a draft intent takes updates; an approved one changes through approval.
 */
export function intentUpdate(store: Store, context: Context): Result<{ sections: string[]; status: string }, BrainstormError> {
  const intent = readDocument(store, 'docs/intent.md');
  if (!intent.ok) return fail('not-drafted', 'intent.md has not been drafted yet');
  const fresh = newAnswers(context.session);
  const sections = context.sections.map((s) => s.heading).filter((h) => h in fresh);
  return ok({ sections, status: intent.value.header.status });
}

/**
 * Adds the new answers to the end of their sections in intent.md, as its next version. The rest of
 * intent.md, including hand edits and removed requirements, stays as it is.
 */
export async function updateIntent(store: Store, given: Context): Promise<Result<StoredDocument, BrainstormError>> {
  const update = intentUpdate(store, given);
  if (!update.ok) return update;
  if (update.value.status !== 'draft') return fail('intent-locked', `intent.md is ${update.value.status}; it no longer takes brainstorm updates`);
  if (update.value.sections.length === 0) return fail('no-change', 'intent.md already has every answer');
  const assigned = await assignRequirementIds(store, given);
  if (!assigned.ok) return assigned;
  const { session } = assigned.value;
  const intent = readDocument(store, 'docs/intent.md');
  if (!intent.ok) return fail('not-drafted', intent.message);
  const fresh = newAnswers(session);
  const body = update.value.sections.reduce((text, h) => appendToSection(text, h, (fresh[h] ?? []).join('\n\n')), intent.value.body);
  const saved = await saveDocument(store, 'docs/intent.md', {
    reason: `Brainstorm: add answers for ${update.value.sections.join(', ')}`,
    body,
  });
  if (!saved.ok) return fail('invalid-input', saved.message);
  await save(store, { ...session, in_intent: answerCounts(session) });
  return saved;
}

/** Project setup: changes the template or style; the next question follows the new template. */
export async function changeSetup(store: Store, change: { template: string; style: string }): Promise<Result<Session, BrainstormError>> {
  const session = readSession(store);
  if (!session.ok) return session;
  const loaded = loadSetup(store.root, change);
  if (!loaded.ok) return loaded;
  const sections = loaded.value;
  const keep = session.value.current && sections.some((s) => s.heading === session.value.current?.section);
  const next: Session = {
    ...session.value, template: change.template, brainstorm_style: change.style,
    current: keep ? session.value.current : nextQuestion(sections, session.value.answers) ?? null,
  };
  await save(store, next);
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

/** One commit per stretch of brainstorm turns (owner decision): later turns are folded into it. */
export function brainstormCommitMessage(session: Session): string {
  const captured = Object.keys(session.answers).filter((h) => isCaptured(session.answers, h));
  return `Brainstorm: ${captured.length ? `captured ${captured.join(', ')}` : 'start'}`;
}

function sessionFile(session: Session): string {
  return matter.stringify(`\n${readable(session)}`, session);
}

async function save(store: Store, session: Session, options: { commit?: boolean } = {}): Promise<void> {
  mkdirSync(dirname(join(store.root, BRAINSTORM_FILE)), { recursive: true });
  writeFileAtomic(join(store.root, BRAINSTORM_FILE), sessionFile(session));
  if (options.commit === false) return;
  await commitSquashing(store.root, [BRAINSTORM_FILE], brainstormCommitMessage(session), 'Brainstorm:');
}

// The body is for people reading the repository; Keel reads the front matter.
function readable(session: Session): string {
  const lines = [`# Brainstorm: ${session.title}`, '', session.idea, ''];
  for (const e of session.transcript) {
    lines.push(e.role === 'assistant' ? `**Keel** (${e.section}): ${e.text}` : `**Proposer**: ${e.text}`, '');
  }
  return `${lines.join('\n').trim()}\n`;
}
