// intent.md assembled from Explore (REQ-002, task R10): the sections go into the intent template exactly as the
// user wrote or accepted them, with no model call. Requirement rows get their IDs when the intent is drafted;
// an ID never changes and is never reused. Once the intent is approved, edits in Explore are saved as a change
// request in changes/CR-NNNN/ (CR-0003) and intent.md stays as approved until the request is approved.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { EXPLORE_FILE, exploreFromIntent, loadContext, readExplore, requiredFilled, sectionOf, sectionText, writeExplore, type BrainstormError, type Context, type Explore } from '../brainstorm/session';
import { changeImpact, sizeOf } from '../changes/impact';
import { createChange, formatChangeId, nextNumber, readChange, updateKeelChange, type ChangeRequest } from '../changes/store';
import { writeFileAtomic } from '../store/atomic';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { createDocument, readDocument, saveDocument, type StoredDocument } from '../store/documents';
import { commitBlocker, commitFiles } from '../store/git';
import { reserveRequirementIds } from '../store/workspace';
import { renderTemplate } from '../templates/render';
import { maxReqNumber, reqIds } from '../trace/parse';

export const INTENT_PATH = 'docs/intent.md';
export const NOT_WRITTEN = '_Not written yet._';

/**
 * The intent body: the template with its title filled and each "## " section replaced by the section's text.
 * Unaccepted suggestions are left out; an empty section reads "_Not written yet._". Pure: no model call.
 */
export function intentMarkdown(context: Pick<Context, 'state' | 'sections' | 'templateContent'>, title: string): string {
  const body = renderTemplate(context.templateContent, { title }).body;
  const headings = new Set(context.sections.map((s) => s.heading));
  const lines = body.split('\n');
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const heading = /^## (.+?)\s*$/.exec(line)?.[1];
    if (heading !== undefined) {
      skipping = headings.has(heading);
      out.push(line);
      if (skipping) {
        const section = context.sections.find((s) => s.heading === heading);
        const text = sectionText(sectionOf(context.state, heading, section?.list));
        out.push('', text || NOT_WRITTEN, '');
      }
      continue;
    }
    if (!skipping) out.push(line);
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/** Gives IDs to the requirement rows that have none (the user's and accepted ones), from the project counter. */
async function assignIds(store: Store, state: Explore, context: Context): Promise<Result<Explore, BrainstormError>> {
  const list = context.sections.find((s) => s.list);
  if (!list) return ok(state);
  const section = sectionOf(state, list.heading, true);
  const rows = section.rows ?? [];
  const fresh = rows.filter((r) => !r.id && r.origin !== 'suggested' && r.text.trim());
  if (fresh.length === 0) return ok(state);
  const used = maxReqNumber(rows.map((r) => r.id ?? '').join(' '));
  const reserved = await reserveRequirementIds(store, fresh.length, used);
  if (!reserved.ok) return fail(reserved.error === 'repo-busy' ? 'repo-busy' : 'invalid-input', reserved.message);
  const ids = [...reserved.value];
  const next = structuredClone(state);
  const target = next.sections.find((s) => s.key === list.heading);
  if (target?.rows) target.rows = target.rows.map((r) => (!r.id && r.origin !== 'suggested' && r.text.trim() ? { ...r, id: ids.shift() } : r));
  return ok(next);
}

/**
 * Draft intent.md: assembles it from Explore and saves it as version 1, or as the next draft version while it is
 * a draft. Refused before every required section counts, and once the intent is approved (then edits become a
 * change request). Explore's state is committed with it.
 */
export async function draftIntent(store: Store): Promise<Result<StoredDocument, BrainstormError>> {
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  const context = loadContext(store);
  if (!context.ok) return context;
  if (!requiredFilled(context.value)) return fail('not-ready', 'Fill in every required section first, Requirements included');
  const existing = readDocument(store, INTENT_PATH);
  if (existing.ok && existing.value.header.status !== 'draft') {
    return fail('intent-locked', `intent.md is ${existing.value.header.status}; save your edits as a change request`);
  }
  const assigned = await assignIds(store, context.value.state, context.value);
  if (!assigned.ok) return assigned;
  const ctx = { ...context.value, state: assigned.value };
  const body = intentMarkdown(ctx, ctx.state.title);
  let saved: Result<StoredDocument, string>;
  if (!existing.ok) {
    saved = await createDocument(store, { kind: 'intent', title: ctx.state.title, body, template: ctx.state.template, extra: { brainstorm_style: ctx.state.style } });
  } else if (existing.value.body.trimEnd() === body.trimEnd()) {
    saved = existing;
  } else {
    saved = await saveDocument(store, INTENT_PATH, { reason: 'Draft from Explore', body });
  }
  if (!saved.ok) return fail(saved.error === 'repo-busy' ? 'repo-busy' : 'invalid-input', saved.message);
  const drafted: Explore = { ...ctx.state, drafted: Object.fromEntries(ctx.state.sections.map((s) => [s.key, sectionText(s)])) };
  writeExplore(store, drafted);
  await commitFiles(store.root, [EXPLORE_FILE], `Brainstorm: drafted intent v${saved.value.header.version}`);
  return ok(saved.value);
}

export interface SectionChange {
  section: string;
  before: string;
  after: string;
}

/** The sections whose text differs from what went into the last draft. */
export function changedSections(context: Pick<Context, 'state' | 'sections'>): SectionChange[] {
  const drafted = context.state.drafted ?? {};
  return context.sections.flatMap((s) => {
    const before = drafted[s.heading] ?? '';
    const after = sectionText(sectionOf(context.state, s.heading, s.list));
    return before.trim() === after.trim() ? [] : [{ section: s.heading, before, after }];
  });
}

/** REQ IDs a change touches: rows changed or removed in Requirements, and IDs named in other changed sections. */
export function affectedRequirements(changes: SectionChange[]): string[] {
  const ids = new Set<string>();
  for (const change of changes) {
    const rows = (text: string) => new Map(text.split('\n').map((l) => /^- (REQ-\d{3,}) (.*)$/.exec(l)).filter((m): m is RegExpExecArray => Boolean(m)).map((m) => [m[1] ?? '', m[2] ?? '']));
    const before = rows(change.before);
    const after = rows(change.after);
    if (before.size || after.size) {
      for (const [id, text] of before) if (after.get(id) !== text) ids.add(id);
    }
    [...reqIds(change.before), ...reqIds(change.after)].filter((id) => !before.has(id) || after.get(id) !== before.get(id)).forEach((id) => ids.add(id));
  }
  return [...ids].sort();
}

const quote = (text: string) => (text.trim() ? text.trim().split('\n').map((l) => `> ${l}`).join('\n') : `> ${NOT_WRITTEN}`);

/**
 * After approval: saves the edits in Explore as a change request in changes/CR-NNNN/ (REQ-014, CR-0003), waiting
 * for approval, with the before and after of each changed section, the affected REQ IDs, the size and the impact
 * on later documents. intent.md is not touched. Saving again updates the same request while it waits.
 */
export async function saveChangeRequest(store: Store): Promise<Result<ChangeRequest, BrainstormError>> {
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  await migrateDocsChanges(store);
  const context = loadContext(store);
  if (!context.ok) return context;
  const intent = readDocument(store, INTENT_PATH);
  if (!intent.ok || intent.value.header.status !== 'approved') return fail('not-approved', 'Only an approved intent takes change requests; draft it again instead');
  const changes = changedSections(context.value);
  if (changes.length === 0) return fail('no-change', 'Nothing changed since the approved intent');
  const affected = affectedRequirements(changes);
  const added = changes.find((c) => c.section === 'Requirements')?.after.split('\n').filter((l) => /^- (?!REQ-)/.test(l)).length ?? 0;
  const ref = `${intent.value.header.id}@${intent.value.header.version}`;
  const size = sizeOf(affected, added);
  const impact = changeImpact(store.root, INTENT_PATH, affected, added);
  const title = `Change to the intent: ${changes.map((c) => c.section).join(', ')}`;
  const body = [
    `# ${title}`, '',
    '## What changed', '',
    `Upstream document: ${ref} (approved). Saved from Explore; intent.md stays as approved until this change request is approved.`, '',
    ...changes.flatMap((c) => [`### ${c.section}`, '', 'Before:', '', quote(c.before), '', 'After:', '', quote(c.after), '']),
    '## Reason', '', 'Edited in Explore after the intent was approved.', '',
    '## Impact', '',
    affected.length ? `Requirements affected: ${affected.join(', ')}.` : 'No existing requirement ID is affected.',
    ...(added ? [`New requirements: ${added} (IDs are given when the change is approved).`] : []),
    ...(impact.documents.length ? ['', ...impact.documents.map((d) => `- ${d.label}: ${[...d.requirements, ...d.items].join('; ') || 'affected'}`)] : []), '',
  ].join('\n');
  const records = size === 'significant' ? impact.documents.map((d) => ({ document: d.document, decision: 'pending' as const })) : [];
  const fields = { title, size, affects: [ref], requirements: affected, source: INTENT_PATH, impact: records };
  const existing = context.value.state.changeRequest ? readChange(store.root, context.value.state.changeRequest) : undefined;
  const saved = existing && existing.origin === 'keel' && (existing.status === 'draft' || existing.status === 'waiting')
    ? await updateKeelChange(store, existing, fields, body, `Update ${existing.id} from Explore`)
    : await createChange(store, { ...fields, reason: 'Edited in Explore after the intent was approved.', status: 'waiting', body });
  if (!saved.ok) return fail(saved.error === 'repo-busy' ? 'repo-busy' : 'invalid-input', saved.message);
  writeExplore(store, { ...context.value.state, changeRequest: saved.value.id });
  await commitFiles(store.root, [EXPLORE_FILE], `Brainstorm: edits saved as ${saved.value.id}`);
  return ok(saved.value);
}

/**
 * Approving a change request to the intent (owner decision 1): the next intent version is written from Explore,
 * approved, recording `change: CR-NNNN`. New requirement rows get their IDs now.
 */
export async function applyIntentChange(store: Store, changeId: string): Promise<Result<StoredDocument, BrainstormError>> {
  const context = loadContext(store);
  if (!context.ok) return context;
  const intent = readDocument(store, INTENT_PATH);
  if (!intent.ok || intent.value.header.status !== 'approved') return fail('not-approved', 'The intent is not approved');
  const assigned = await assignIds(store, context.value.state, context.value);
  if (!assigned.ok) return assigned;
  const ctx = { ...context.value, state: assigned.value };
  const saved = await saveDocument(store, INTENT_PATH, { reason: `Change request ${changeId}`, body: intentMarkdown(ctx, ctx.state.title), extra: { change: changeId } });
  if (!saved.ok) return fail(saved.error === 'repo-busy' ? 'repo-busy' : 'invalid-input', saved.message);
  const next: Explore = { ...ctx.state, drafted: Object.fromEntries(ctx.state.sections.map((s) => [s.key, sectionText(s)])) };
  delete next.changeRequest;
  writeExplore(store, next);
  await commitFiles(store.root, [EXPLORE_FILE], `Brainstorm: ${changeId} applied to intent v${saved.value.header.version}`);
  return ok(saved.value);
}

/** Rejecting a change request to the intent (owner decision 1): Explore goes back to the approved text. */
export async function revertIntentChange(store: Store): Promise<Result<Explore, BrainstormError>> {
  const context = loadContext(store);
  if (!context.ok) return context;
  const intent = readDocument(store, INTENT_PATH);
  if (!intent.ok) return fail('not-found', intent.message);
  const approved = exploreFromIntent({ ...context.value.state, intentBody: intent.value.body, templateContent: context.value.templateContent });
  const next: Explore = {
    ...context.value.state,
    sections: context.value.state.sections.map((s) => {
      const back = approved.sections.find((a) => a.key === s.key);
      return back ? { ...s, value: back.value, ...(back.rows ? { rows: back.rows } : {}), origin: 'user' as const } : s;
    }),
    drafted: approved.drafted,
  };
  delete next.changeRequest;
  writeExplore(store, next);
  await commitFiles(store.root, [EXPLORE_FILE], 'Brainstorm: back to the approved intent');
  return ok(next);
}

/**
 * One-off move of R10's docs/changes/NNNN-*.md into changes/CR-NNNN/CR-NNNN.md (CR-0003): the next free number,
 * the content kept, the header mapped, as one Keel commit. Explore's link follows.
 */
export async function migrateDocsChanges(store: Store): Promise<string[]> {
  const dir = join(store.root, 'docs', 'changes');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  if (files.length === 0) return [];
  const moved: string[] = [];
  const paths: string[] = [];
  const renames = new Map<string, string>();
  for (const name of files) {
    const old = `docs/changes/${name}`;
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(readFileSync(join(store.root, old), 'utf8'), {});
    } catch {
      continue;
    }
    const id = formatChangeId(nextNumber(store.root));
    const data = parsed.data as Record<string, unknown>;
    const status = data.status === 'approved' ? 'approved' : data.status === 'closed' ? 'rejected' : 'waiting';
    const document = typeof data.document === 'string' ? data.document : undefined;
    const header = {
      ...data, id, status, origin: 'keel', ...(document?.startsWith('INT-') ? { source: INTENT_PATH } : {}),
      affects: Array.isArray(data.affects) ? data.affects : document ? [document] : [], moved_from: old,
    };
    delete (header as Record<string, unknown>).version;
    delete (header as Record<string, unknown>).template;
    delete (header as Record<string, unknown>).updated;
    mkdirSync(join(store.root, 'changes', id), { recursive: true });
    writeFileAtomic(join(store.root, 'changes', id, `${id}.md`), matter.stringify(parsed.content, header));
    rmSync(join(store.root, old));
    renames.set(typeof data.id === 'string' ? data.id : old, id);
    renames.set(old, id);
    paths.push(`changes/${id}`, old);
    moved.push(id);
  }
  const state = readExplore(store);
  if (state.ok && state.value.changeRequest && renames.has(state.value.changeRequest)) {
    writeExplore(store, { ...state.value, changeRequest: renames.get(state.value.changeRequest) });
    paths.push(EXPLORE_FILE);
  }
  if (paths.length) await commitFiles(store.root, paths, `Move ${moved.join(', ')} from docs/changes to changes/`);
  return moved;
}
