// Dependencies and requirement IDs across change requests (REQ-015, CR-0013): open requests that touch the same
// documents or requirements are suggested as depends_on, and two open requests naming the same new requirement ID
// are flagged; the later one is offered the next free ID.
import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import { join } from 'node:path';
import { readDocument } from '../store/documents';
import type { Store } from '../store/store';
import { requirementStatements } from '../trace/parse';
import { fail, ok, type Result } from '../result';
import { lenientHeader, readChange, updateKeelChange, type ChangeRequest } from './store';

const open = (cr: ChangeRequest) => cr.status !== 'rejected' && !(cr.status === 'approved' && cr.tasks.length > 0 && cr.tasks.every((t) => t.status === 'done'));
const docOf = (ref: string) => ref.split('@')[0] ?? ref;

/** Earlier open requests that touch the same documents or requirements, not already in depends_on. */
export function suggestDependsOn(cr: ChangeRequest, all: ChangeRequest[]): string[] {
  return all.filter((o) => o.id !== cr.id && o.number < cr.number && open(o) && !cr.dependsOn.includes(o.id))
    .filter((o) => o.requirements.some((r) => cr.requirements.includes(r)) || o.affects.some((a) => cr.affects.some((b) => docOf(a) === docOf(b))))
    .map((o) => o.id);
}

/** The header's requirements as written ("REQ-016 (new)"): YAML first, line by line for files YAML cannot read. */
function headerRequirements(root: string, cr: ChangeRequest): string[] {
  const text = readFileSync(join(root, cr.file), 'utf8');
  let list: unknown;
  try {
    list = matter(text, {}).data.requirements;
  } catch {
    list = lenientHeader(text)?.data.requirements;
  }
  return Array.isArray(list) ? list.map(String) : typeof list === 'string' ? [list] : [];
}

/** The requirement IDs a request marks as new in its header ("REQ-016 (new)"). */
export function newRequirementIds(root: string, cr: ChangeRequest): string[] {
  try {
    const items = headerRequirements(root, cr);
    return items.filter((i) => /\(new\)/i.test(i)).map((i) => /REQ-\d{3,}/.exec(i)?.[0]).filter((i): i is string => Boolean(i));
  } catch {
    return [];
  }
}

/** The next requirement ID nobody uses: past the documents' and every request's. */
export function nextFreeRequirement(root: string, all: ChangeRequest[]): string {
  const store = { root } as Store;
  const used = new Set<number>();
  for (const path of ['docs/intent.md', 'docs/spec.md']) {
    const doc = readDocument(store, path);
    if (doc.ok) Object.keys(requirementStatements(doc.value.body)).forEach((r) => used.add(Number(r.slice(4))));
  }
  all.forEach((cr) => cr.requirements.forEach((r) => used.add(Number(r.slice(4)))));
  const next = Math.max(0, ...used) + 1;
  return `REQ-${String(next).padStart(3, '0')}`;
}

export interface IdClash { req: string; ids: string[]; later: string; next: string; message: string }

/** Open requests that both name the same new requirement ID. */
export function idClashes(root: string, all: ChangeRequest[]): IdClash[] {
  const byReq = new Map<string, ChangeRequest[]>();
  for (const cr of all.filter(open)) for (const req of newRequirementIds(root, cr)) byReq.set(req, [...(byReq.get(req) ?? []), cr]);
  const next = nextFreeRequirement(root, all);
  return [...byReq.entries()].filter(([, crs]) => crs.length > 1).map(([req, crs]) => {
    const sorted = [...crs].sort((a, b) => a.number - b.number);
    const later = sorted.at(-1)?.id ?? '';
    return { req, ids: sorted.map((c) => c.id), later, next, message: `${req} is named as new by ${sorted.map((c) => c.id).join(' and ')}.` };
  });
}

/** Renames a new requirement ID in a Keel request's header and text (the later of two clashing requests). */
export async function renumberRequirement(store: Store, id: string, from: string, to: string): Promise<Result<ChangeRequest, 'not-found' | 'not-keel' | 'repo-busy'>> {
  const cr = readChange(store.root, id);
  if (!cr) return fail('not-found', `No change request ${id}`);
  const items = headerRequirements(store.root, cr).map((r) => r.replace(from, to));
  const updated = await updateKeelChange(store, cr, { requirements: items }, cr.body.split(from).join(to), `${id}: ${from} is now ${to}`);
  return updated.ok ? ok(updated.value) : fail(updated.error, updated.message);
}
