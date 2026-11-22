// Deciding a design topic (REQ-013, task R12). The choice is a decision record in docs/decisions/ (the existing ADR
// numbering) with the alternatives considered. While the spec is a draft, changing a decision rewrites its record
// with a "Changed from" line; after approval the change goes through a change request (CR-0003), and approving it
// writes a new record that supersedes the old one. The spec's Design, Approach and design concerns follow.
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { createDocument, readDocument, saveDocument, type StoredDocument } from '../store/documents';
import { commitBlocker, commitFiles } from '../store/git';
import { today } from '../store/workspace';
import { createChange, readChange, updateKeelChange } from '../changes/store';
import type { Writer } from '../generate/writer';
import { chosenOption, DESIGN_FILE, readDesign, writeDesign, type Design, type Fit, type Topic } from './design';
import { reviewOwnOption } from './own';

export type DecideError = 'not-found' | 'invalid-input' | 'repo-busy' | 'failed';

export interface Choice {
  chosen: string;                                // an option id, or "own"
  own?: { name: string; summary?: string };
  reason: string;
}

const SPEC = 'docs/spec.md';

function recordBody(topic: Topic, changes: string[]): string {
  const chosen = chosenOption(topic);
  const others = topic.options.filter((o) => o.id !== topic.chosen);
  return [
    `# ${topic.title}: ${chosen?.name ?? 'undecided'}`, '',
    '## Decision', '', `${chosen?.name ?? ''}.${chosen?.summary ? ` ${chosen.summary}` : ''}`, '',
    '## Reason', '', topic.reason?.trim() || '_Not written yet._', '',
    '## Alternatives considered', '',
    ...(others.length ? others.map((o) => `- ${o.name}: ${o.summary}${o.pro || o.con ? ` (pro: ${o.pro}; con: ${o.con})` : ''}`) : ['- None proposed.']), '',
    '## Consequences', '', chosen?.fit ? `- ${chosen.fit.text}` : '- None noted.', '',
    ...(changes.length ? ['## Changes', '', ...changes.map((c) => `- ${c}`), ''] : []),
  ].join('\n');
}

const changesOf = (body: string): string[] => {
  const section = /^## Changes\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)?.[1] ?? '';
  return section.split('\n').map((l) => /^- (.*)$/.exec(l.trim())?.[1]).filter((l): l is string => Boolean(l));
};

/** The spec's Design section: one line per topic, with its record. */
export function designSection(topics: Topic[]): string {
  return topics.map((t) => {
    const chosen = chosenOption(t);
    return `- **${t.title}:** ${chosen ? `${chosen.name}${t.record ? ` (\`${t.record}\`)` : ''}` : '_Not decided yet._'}`;
  }).join('\n') || '_No design topics._';
}

/** The Approach section, assembled from the chosen options. */
export function approachSection(topics: Topic[]): string {
  const lines = topics.flatMap((t) => {
    const chosen = chosenOption(t);
    return chosen ? [`- **${t.title}:** ${chosen.name}.${chosen.summary ? ` ${chosen.summary}` : ''}`] : [];
  });
  return lines.join('\n') || '_Assembled from the design decisions once they are made._';
}

/** Concerns the chosen options bring: a standard broken, a conflict, or a concern added. */
export function designConcerns(topics: Topic[]): string[] {
  return topics.flatMap((t) => {
    const fit: Fit | undefined = chosenOption(t)?.fit;
    return fit && fit.kind !== 'follows' ? [`- **${t.title}: ${fit.text}.** From the design decision.`] : [];
  });
}

const MARK = 'From the design decision.';

function replaceSection(body: string, heading: string, content: string): string {
  const pattern = new RegExp(`(^## ${heading}\\s*\\n)([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
  return pattern.test(body) ? body.replace(pattern, `$1\n${content}\n\n`) : body;
}

/** The spec body with Design, Approach and the design concerns rebuilt from the topics. */
export function specWithDesign(body: string, topics: Topic[]): string {
  let next = replaceSection(body, 'Design', designSection(topics));
  next = replaceSection(next, 'Approach', approachSection(topics));
  const concerns = /^## Flagged concerns\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(next)?.[1] ?? '';
  const kept = concerns.split('\n').filter((l) => !l.includes(MARK)).join('\n').trim();
  const added = designConcerns(topics);
  return replaceSection(next, 'Flagged concerns', [kept, ...added].filter(Boolean).join('\n') || '_None._');
}

async function updateSpec(store: Store, topics: Topic[], reason: string, extra: Record<string, unknown> = {}): Promise<void> {
  const spec = readDocument(store, SPEC);
  if (!spec.ok) return;
  const body = specWithDesign(spec.value.body, topics);
  if (body.trimEnd() !== spec.value.body.trimEnd()) await saveDocument(store, SPEC, { body, reason, extra });
}

/** Writes the topic's record: a new one, or the same one rewritten with a "Changed from" line. */
async function writeRecord(store: Store, topic: Topic, previous?: string, supersedes?: StoredDocument): Promise<Result<StoredDocument, DecideError>> {
  const existing = topic.record && !supersedes ? readDocument(store, topic.record) : undefined;
  const changes = existing?.ok ? changesOf(existing.value.body) : [];
  if (previous) changes.push(`Changed from ${previous} on ${today(store)}.`);
  const body = recordBody(topic, changes);
  const chosen = chosenOption(topic);
  const extra = { topic: topic.title, chosen: chosen?.name ?? '', ...(supersedes ? { supersedes: supersedes.header.id } : {}) };
  const saved = existing?.ok
    ? await saveDocument(store, existing.value.path, { reason: `${topic.title}: ${chosen?.name}`, body, title: `${topic.title}: ${chosen?.name}`, extra })
    : await createDocument(store, { kind: 'decision', title: `${topic.title}: ${chosen?.name}`, body, template: 'decision-record@1', status: 'approved', fileSlug: topic.id, extra });
  return saved.ok ? ok(saved.value) : fail(saved.error === 'repo-busy' ? 'repo-busy' : 'failed', saved.message);
}

/** The topic with the choice applied, the user's own option reviewed against requirements and standards. */
async function applyChoice(store: Store, topic: Topic, choice: Choice, write?: Writer): Promise<Result<Topic, DecideError>> {
  if (choice.chosen === 'own') {
    const name = choice.own?.name.trim();
    if (!name) return fail('invalid-input', 'Write your own option first');
    const fit = write ? await reviewOwnOption(store, topic, { name, summary: choice.own?.summary ?? '' }, write) : undefined;
    return ok({ ...topic, chosen: 'own', own: { name, summary: choice.own?.summary?.trim() ?? '', ...(fit ? { fit } : {}) }, reason: choice.reason.trim() });
  }
  if (!topic.options.some((o) => o.id === choice.chosen)) return fail('invalid-input', 'Pick one of the options, or write your own');
  const next = { ...topic, chosen: choice.chosen, reason: choice.reason.trim() };
  delete next.own;
  return ok(next);
}

export type Decided = { record: string } | { held: string };

/**
 * Decide or change a topic. While the spec is a draft: the record is written (or rewritten) and the spec follows.
 * Once it is approved: the choice is held and raised as a change request; approving it applies the choice.
 */
export async function decide(store: Store, id: string, choice: Choice, write?: Writer): Promise<Result<Decided, DecideError>> {
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  const design = readDesign(store.root);
  const topic = design.topics.find((t) => t.id === id);
  if (!topic) return fail('not-found', `No design topic ${id}`);
  const applied = await applyChoice(store, topic, choice, write);
  if (!applied.ok) return applied;
  const spec = readDocument(store, SPEC);
  const previous = chosenOption(topic)?.name;
  if (previous && previous === chosenOption(applied.value)?.name && (topic.reason ?? '') === applied.value.reason) return fail('invalid-input', 'Nothing changed');

  if (spec.ok && spec.value.header.status === 'approved' && previous) {
    const change = await raiseDesignChange(store, design, applied.value, previous);
    if (!change.ok) return change;
    writeDesign(store.root, { ...readDesign(store.root), pending: { change: change.value, topic: id, chosen: applied.value.chosen ?? '', own: applied.value.own, reason: applied.value.reason ?? '' } });
    await commitFiles(store.root, [DESIGN_FILE], `Design: ${topic.title} held for ${change.value}`);
    return ok({ held: change.value });
  }
  const record = await writeRecord(store, applied.value, previous && previous !== chosenOption(applied.value)?.name ? previous : undefined);
  if (!record.ok) return record;
  const topics = design.topics.map((t) => (t.id === id ? { ...applied.value, record: record.value.path } : t));
  writeDesign(store.root, { ...design, topics });
  await updateSpec(store, topics, `Design: ${topic.title} ${previous ? 'changed' : 'decided'}`);
  await commitFiles(store.root, [DESIGN_FILE], `Design: ${topic.title}: ${chosenOption(applied.value)?.name}`);
  return ok({ record: record.value.path });
}

async function raiseDesignChange(store: Store, design: Design, topic: Topic, previous: string): Promise<Result<string, DecideError>> {
  const spec = readDocument(store, SPEC);
  const ref = spec.ok ? `${spec.value.header.id}@${spec.value.header.version}` : 'SPC-0001';
  const chosen = chosenOption(topic);
  const title = `Change the design decision: ${topic.title}`;
  const body = [
    `# ${title}`, '',
    '## What changed', '', `Upstream document: ${ref} (approved). ${topic.title}: ${previous} → ${chosen?.name}.`, '',
    `Record: \`${topic.record ?? 'new'}\` is superseded by a new record when this change request is approved.`, '',
    '## Reason', '', topic.reason?.trim() || '_Not written yet._', '',
  ].join('\n');
  const fields = { title, size: 'significant' as const, affects: [ref], requirements: chosen && 'serves' in chosen ? (chosen as { serves: string[] }).serves : [], source: SPEC, design_change: topic.id };
  const existing = design.pending ? readChange(store.root, design.pending.change) : undefined;
  const saved = existing && existing.origin === 'keel' && (existing.status === 'draft' || existing.status === 'waiting')
    ? await updateKeelChange(store, existing, fields, body, `Update ${existing.id}: design`)
    : await createChange(store, { ...fields, reason: topic.reason ?? '', status: 'waiting', body, impact: [{ document: 'docs/plan.md', decision: 'pending' }], extra: { design_change: topic.id } });
  return saved.ok ? ok(saved.value.id) : fail(saved.error === 'repo-busy' ? 'repo-busy' : 'failed', saved.message);
}

/**
 * Approving the change request: a new record supersedes the old one (both stay in history), the topic takes the
 * new choice, and the spec's Design and Approach follow, recording the change request. Rejecting drops it.
 */
export async function settleDesignChange(store: Store, change: string, approved: boolean): Promise<boolean> {
  const design = readDesign(store.root);
  const pending = design.pending;
  if (pending?.change !== change) return false;
  const next: Design = { ...design };
  delete next.pending;
  if (approved) {
    const topic = design.topics.find((t) => t.id === pending.topic);
    if (topic) {
      const chosenTopic: Topic = { ...topic, chosen: pending.chosen, reason: pending.reason, ...(pending.own ? { own: pending.own } : {}) };
      const old = topic.record ? readDocument(store, topic.record) : undefined;
      const record = await writeRecord(store, { ...chosenTopic, record: undefined }, undefined, old?.ok ? old.value : undefined);
      if (record.ok && old?.ok) await saveDocument(store, old.value.path, { reason: `Superseded by ${record.value.header.id} (${change})`, status: 'closed', sameVersion: true, extra: { superseded_by: record.value.header.id } });
      next.topics = design.topics.map((t) => (t.id === topic.id ? { ...chosenTopic, ...(record.ok ? { record: record.value.path } : {}) } : t));
      await updateSpec(store, next.topics, `Design: ${topic.title} changed by ${change}`, { change });
    }
  }
  writeDesign(store.root, next);
  await commitFiles(store.root, [DESIGN_FILE], approved ? `Design: ${change} applied` : `Design: drop the change in ${change}`);
  return true;
}
