// What the assistant can see in Discuss a change (REQ-017, CR-0016): one checkbox per source, per discussion. Intent,
// requirements, decisions, plan and open change requests are on by default; the code map is names only and follows
// the project's code map setting; standards are names only and off by default. Sections the conversation names by ID
// (REQ, ADR, task, CR) are added in full, from the ticked sources only. Attachments are the user's, each time.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { listChanges, isApplied } from '../changes/store';
import { readDesign } from '../decisions/design';
import { mayHoldKeys } from '../readiness/secrets';
import { codeMap } from '../repo/scan';
import { listStandards } from '../standards/library';
import { readDocument } from '../store/documents';
import type { Store } from '../store/store';
import { readProject } from '../store/workspace';
import { requirementStatements } from '../trace/parse';
import { looksLikeKey } from './keys';

export const SOURCES = [
  { id: 'intent', label: 'Intent', on: true },
  { id: 'requirements', label: 'Requirements', on: true },
  { id: 'decisions', label: 'Decisions', on: true },
  { id: 'plan', label: 'Plan', on: true },
  { id: 'changes', label: 'Open change requests', on: true },
  { id: 'codemap', label: 'Code map (file names)', on: true },
  { id: 'standards', label: 'Standards (names)', on: false },
] as const;
export type SourceId = (typeof SOURCES)[number]['id'];

const MAX_SECTION = 8 * 1024;
const MAX_ATTACHMENT = 100 * 1024;
const MAX_NAMES = 2000;

/** The sources this project offers (no code map when the setting is Off), with their default tick. */
export function availableSources(root: string): { id: SourceId; label: string; on: boolean }[] {
  const project = readProject(root);
  const mapOff = project.ok && project.value.codeMap === 'off';
  return SOURCES.filter((s) => !(s.id === 'codemap' && mapOff)).map((s) => ({ ...s }));
}

export const defaultSources = (root: string): SourceId[] => availableSources(root).filter((s) => s.on).map((s) => s.id);

export interface ContextBlock { source: SourceId | 'pulled'; label: string; text: string }

const clip = (text: string, max = MAX_SECTION) => (text.length > max ? `${text.slice(0, max)}\n…` : text);
const read = (path: string) => { try { return readFileSync(path, 'utf8'); } catch { return undefined; } };

function statements(store: Store): Record<string, string> {
  const intent = readDocument(store, 'docs/intent.md');
  const spec = readDocument(store, 'docs/spec.md');
  return { ...(intent.ok ? requirementStatements(intent.value.body) : {}), ...(spec.ok ? requirementStatements(spec.value.body) : {}) };
}

function decisionFiles(root: string): string[] {
  const dir = join(root, 'docs', 'decisions');
  return existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort() : [];
}

function taskFiles(root: string): string[] {
  const dir = join(root, 'tasks');
  return existsSync(dir) ? readdirSync(dir).filter((f) => /^[TR]\d+\.md$/.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
}

function block(store: Store, id: SourceId): string | undefined {
  const { root } = store;
  if (id === 'intent') {
    const intent = readDocument(store, 'docs/intent.md');
    return intent.ok ? clip(intent.value.body, 20 * 1024) : undefined;
  }
  if (id === 'requirements') {
    const all = statements(store);
    return Object.keys(all).length ? Object.entries(all).map(([r, s]) => `- ${r} ${s}`).join('\n') : undefined;
  }
  if (id === 'decisions') {
    const records = decisionFiles(root).map((f) => `- ADR-${f.slice(0, 4)} ${/^# (.+)$/m.exec(read(join(root, 'docs', 'decisions', f)) ?? '')?.[1] ?? f}`);
    const design = readDesign(root).topics.filter((t) => t.chosen).map((t) => `- ${t.title}: ${t.chosen === 'own' ? t.own?.name : t.options.find((o) => o.id === t.chosen)?.name ?? t.chosen}`);
    return [...records, ...design].join('\n') || undefined;
  }
  if (id === 'plan') {
    const tasks = taskFiles(root).map((f) => {
      const text = read(join(root, 'tasks', f)) ?? '';
      return `- ${basename(f, '.md')} ${/^# (?:[TR]\d+ · )?(.+)$/m.exec(text)?.[1] ?? ''} (${/^status: (\w+)/m.exec(text)?.[1] ?? 'todo'})`;
    });
    return tasks.join('\n') || undefined;
  }
  if (id === 'changes') {
    const open = listChanges(root).filter((c) => c.status !== 'rejected' && !isApplied(c));
    return open.map((c) => `- ${c.id} ${c.title} (${c.status}; ${c.requirements.join(', ') || 'no requirements named'})`).join('\n') || undefined;
  }
  if (id === 'codemap') {
    const names = codeMap(root, MAX_NAMES);
    return names.length ? names.join('\n') : undefined;
  }
  return listStandards(root).map((s) => `- ${s.name}`).join('\n') || undefined;
}

/** IDs the conversation names, for sections added in full. */
export function namedIds(text: string): string[] {
  return [...new Set(text.match(/\b(?:REQ-\d{3,}|ADR-\d{4}|CR-\d{4}|[TR]\d{1,3})\b/g) ?? [])];
}

/** The full sections the conversation names, from the ticked sources only. */
function pulled(store: Store, sources: SourceId[], conversation: string): ContextBlock[] {
  const { root } = store;
  const blocks: ContextBlock[] = [];
  const all = sources.includes('requirements') ? statements(store) : {};
  for (const id of namedIds(conversation)) {
    if (id.startsWith('REQ-') && all[id]) blocks.push({ source: 'pulled', label: id, text: `${id} ${all[id]}` });
    if (id.startsWith('ADR-') && sources.includes('decisions')) {
      const file = decisionFiles(root).find((f) => f.startsWith(id.slice(4)));
      const text = file && read(join(root, 'docs', 'decisions', file));
      if (text) blocks.push({ source: 'pulled', label: id, text: clip(text) });
    }
    if (/^[TR]\d+$/.test(id) && sources.includes('plan')) {
      const text = read(join(root, 'tasks', `${id}.md`));
      if (text) blocks.push({ source: 'pulled', label: id, text: clip(text) });
    }
    if (id.startsWith('CR-') && sources.includes('changes')) {
      const text = read(join(root, 'changes', id, `${id}.md`));
      if (text) blocks.push({ source: 'pulled', label: id, text: clip(text) });
    }
  }
  return blocks;
}

/** Everything the assistant sees for this turn, from the ticked sources and the IDs named so far. */
export function buildContext(store: Store, sources: SourceId[], conversation: string): ContextBlock[] {
  const allowed = new Set(availableSources(store.root).map((s) => s.id));
  const ticked = sources.filter((s) => allowed.has(s));
  const label = (id: SourceId) => SOURCES.find((s) => s.id === id)?.label ?? id;
  const blocks = ticked.flatMap((id) => { const text = block(store, id); return text ? [{ source: id, label: label(id), text }] : []; });
  return [...blocks, ...pulled(store, ticked, conversation)];
}

export interface Attachment { name: string; text: string }
/** An attachment, or why it cannot be attached: names that may hold keys, binary files and text that looks like a key. */
export function checkAttachment(name: string, text: string): { ok: true; attachment: Attachment } | { ok: false; reason: string } {
  if (mayHoldKeys(name)) return { ok: false, reason: `${name} may contain keys: it cannot be attached.` };
  if (text.includes('\u0000')) return { ok: false, reason: `${name} is not a text file.` };
  if (looksLikeKey(text)) return { ok: false, reason: `${name} looks like it holds a key: it cannot be attached.` };
  return { ok: true, attachment: { name: basename(name), text: text.slice(0, MAX_ATTACHMENT) } };
}

/** Tokens, estimated as characters / 4. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
export const DEFAULT_CONTEXT = 32_768;
/** Above this share of the context, the oldest messages are summarised. */
export const SUMMARY_AT = 0.6;
