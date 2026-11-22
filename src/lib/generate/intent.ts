// intent.md assembled from Explore (REQ-002, task R10): the sections go into the intent template exactly as the
// user wrote or accepted them, with no model call. Requirement rows get their IDs when the intent is drafted;
// an ID never changes and is never reused. Once the intent is approved, edits in Explore are saved as a change
// request in docs/changes/ and intent.md stays as approved (owner decision 3).
import { EXPLORE_FILE, loadContext, requiredFilled, sectionOf, sectionText, writeExplore, type BrainstormError, type Context, type Explore } from '../brainstorm/session';
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
 * After approval: saves the edits in Explore as a draft change request in docs/changes/, with the before and after
 * of each changed section and the affected REQ IDs (owner decision 3). intent.md is not touched. Saving again
 * updates the same change request.
 */
export async function saveChangeRequest(store: Store): Promise<Result<StoredDocument, BrainstormError>> {
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  const context = loadContext(store);
  if (!context.ok) return context;
  const intent = readDocument(store, INTENT_PATH);
  if (!intent.ok || intent.value.header.status !== 'approved') return fail('not-approved', 'Only an approved intent takes change requests; draft it again instead');
  const changes = changedSections(context.value);
  if (changes.length === 0) return fail('no-change', 'Nothing changed since the approved intent');
  const affected = affectedRequirements(changes);
  const newRows = changes.find((c) => c.section === 'Requirements')?.after.split('\n').filter((l) => /^- (?!REQ-)/.test(l)).length ?? 0;
  const ref = `${intent.value.header.id}@${intent.value.header.version}`;
  const title = `Change to the intent: ${changes.map((c) => c.section).join(', ')}`;
  const body = [
    `# ${title}`, '',
    '## What changed', '',
    `Upstream document: ${ref} (approved). Saved from Explore; intent.md stays as approved until this change request is approved.`, '',
    ...changes.flatMap((c) => [`### ${c.section}`, '', 'Before:', '', quote(c.before), '', 'After:', '', quote(c.after), '']),
    '## Reason', '', NOT_WRITTEN, '',
    '## Impact', '',
    affected.length ? `Requirements affected: ${affected.join(', ')}.` : 'No existing requirement ID is affected.',
    ...(newRows ? [`New requirements: ${newRows} (IDs are given when the change is applied).`] : []), '',
    '## Decision', '', 'Open.', '',
  ].join('\n');
  const extra = { document: ref, affects: [ref], requirements: affected, size: changes.length > 1 || newRows > 0 ? 'significant' : 'minor' };
  const existing = context.value.state.changeRequest ? readDocument(store, context.value.state.changeRequest) : undefined;
  const saved = existing?.ok && existing.value.header.status === 'draft'
    ? await saveDocument(store, existing.value.path, { reason: 'Edits saved from Explore', title, body, extra })
    : await createDocument(store, { kind: 'change', title, body, template: 'change-request@1', fileSlug: 'intent-change', extra });
  if (!saved.ok) return fail(saved.error === 'repo-busy' ? 'repo-busy' : 'invalid-input', saved.message);
  writeExplore(store, { ...context.value.state, changeRequest: saved.value.path });
  await commitFiles(store.root, [EXPLORE_FILE], `Brainstorm: edits saved as ${saved.value.header.id}`);
  return ok(saved.value);
}
