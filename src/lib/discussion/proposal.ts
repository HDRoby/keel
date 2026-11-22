// The proposal that ends a discussion (REQ-017, ADR-0019): one ```keel-proposal block with JSON in a fixed format.
// Keel reads it (an invalid block is asked for again once), checks it without a model and shows it as a card. The
// model never chooses IDs: new requirements, tasks and decisions are "new" until the user agrees.
import { z } from 'zod';
import { isApplied, listChanges } from '../changes/store';
import { codeMap } from '../repo/scan';
import { readDocument } from '../store/documents';
import type { Store } from '../store/store';
import { requirementStatements } from '../trace/parse';
import { ASSISTANT, type Discussion } from './file';

const ref = z.string().trim().regex(/^(REQ-\d{3,}|new)$/i).transform((v) => (v.toLowerCase() === 'new' ? 'new' : v.toUpperCase()));
const text = (max: number) => z.string().trim().min(1).max(max);
export const proposalSchema = z.object({
  title: text(160),
  why: text(2000),
  what: z.array(text(500)).min(1).max(12),
  requirements: z.array(z.object({ id: ref, change: z.enum(['new', 'changed', 'removed']), text: text(600) })).max(12).default([]),
  impact: z.array(z.object({ area: text(120), requirements: z.array(ref).max(12).default([]), what: text(500) })).max(12).default([]),
  scenarios: z.array(z.object({ title: text(200), requirement: ref })).max(12).default([]),
  tasks: z.array(z.object({ title: text(160), files: z.array(text(300)).max(20).default([]) })).min(1).max(8),
  decision: z.object({ title: text(160), alternatives: z.array(text(300)).max(5).default([]) }).optional(),
  dependsOn: z.array(z.string().trim().regex(/^CR-\d{4,}$/)).max(8).default([]),
  screens: z.array(text(120)).max(12).default([]),
});
export type Proposal = z.infer<typeof proposalSchema>;

const BLOCK = /```keel-proposal[ \t]*\n([\s\S]*?)```/g;

/** The last keel-proposal block of a reply, and the reply without it. */
export function extractProposal(reply: string): { block?: string; rest: string } {
  const blocks = [...reply.matchAll(BLOCK)];
  const last = blocks.at(-1);
  return last ? { block: (last[1] ?? '').trim(), rest: reply.replace(BLOCK, '').trim() } : { rest: reply.trim() };
}

export function parseProposal(block: string): { ok: true; proposal: Proposal } | { ok: false; reason: string } {
  try {
    const parsed = proposalSchema.safeParse(JSON.parse(block));
    return parsed.success ? { ok: true, proposal: parsed.data } : { ok: false, reason: z.prettifyError(parsed.error) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'not JSON' };
  }
}

export const proposalBlock = (p: Proposal) => `\`\`\`keel-proposal\n${JSON.stringify(p, null, 2)}\n\`\`\``;
export const UNREADABLE = 'The proposal could not be read; ask the assistant to propose again';

/** The message asking for the block again, once. */
export function retryMessage(reason: string) {
  return `Your keel-proposal block could not be read (${reason.split('\n').slice(0, 3).join('; ')}). Answer again with only one valid keel-proposal block in the format given.`;
}

export type ProposalState =
  | { kind: 'none' }
  | { kind: 'waiting'; proposal: Proposal; from: number }          // index of the entry it came from
  | { kind: 'unreadable' };

/** The proposal waiting for Agree: the latest readable one, from an assistant reply or the user's edit. */
export function proposalState(d: Discussion): ProposalState {
  if (d.status === 'cr') return { kind: 'none' };
  for (let i = d.entries.length - 1; i >= 0; i -= 1) {
    const e = d.entries[i];
    if (!e || e.kind === 'summary') continue;
    if (e.kind === 'message' && e.author !== ASSISTANT) continue;
    const { block } = extractProposal(e.text);
    if (!block) continue;
    const parsed = parseProposal(block);
    if (parsed.ok) return { kind: 'waiting', proposal: parsed.proposal, from: i };
    return i === d.entries.length - 1 ? { kind: 'unreadable' } : { kind: 'none' };
  }
  return { kind: 'none' };
}

export interface Check { kind: 'ok' | 'warn' | 'error'; text: string }

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
function overlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.max(1, Math.min(x.size, y.size));
}

/** Keel's checks, without a model. An error disables Agree until the proposal is edited. */
export function checkProposal(store: Store, p: Proposal): Check[] {
  const checks: Check[] = [];
  const intent = readDocument(store, 'docs/intent.md');
  const spec = readDocument(store, 'docs/spec.md');
  const known = { ...(intent.ok ? requirementStatements(intent.value.body) : {}), ...(spec.ok ? requirementStatements(spec.value.body) : {}) };
  const named = [...p.requirements.map((r) => r.id), ...p.impact.flatMap((i) => i.requirements), ...p.scenarios.map((s) => s.requirement)];
  const unknown = [...new Set(named.filter((id) => id !== 'new' && !known[id]))];
  for (const id of unknown) checks.push({ kind: 'error', text: `Unknown requirement ${id}` });
  for (const r of p.requirements) if (r.id === 'new' && r.change !== 'new') checks.push({ kind: 'error', text: `A ${r.change} requirement needs its ID: "${r.text.slice(0, 60)}"` });
  if (!unknown.length && named.some((id) => id !== 'new')) checks.push({ kind: 'ok', text: 'The requirement IDs exist' });

  const map = new Set(codeMap(store.root));
  const files = p.tasks.flatMap((t) => t.files).filter((f) => !/\(new\)\s*$/i.test(f) && !/^to be decided/i.test(f));
  const outside = files.filter((f) => !map.has(f.replace(/^\.\//, '')));
  for (const f of outside) checks.push({ kind: 'warn', text: `Not in the code map and not marked new: ${f}` });
  if (p.tasks.some((t) => t.files.length) && !outside.length) checks.push({ kind: 'ok', text: 'The files are in the code map or marked new' });

  const open = listChanges(store.root).filter((c) => c.status !== 'rejected' && !isApplied(c));
  for (const id of p.dependsOn) if (!listChanges(store.root).some((c) => c.id === id)) checks.push({ kind: 'warn', text: `Depends on ${id}, which does not exist` });
  const reqs = new Set(p.requirements.map((r) => r.id).filter((id) => id !== 'new'));
  for (const c of open) {
    const sameReqs = reqs.size > 0 && c.requirements.some((r) => reqs.has(r));
    if ((sameReqs || reqs.size === 0) && overlap(c.title, p.title) >= 0.6) checks.push({ kind: 'error', text: `Looks like ${c.id} (${c.title}), which is still open` });
  }

  // Constraints in the intent that the proposal touches, as notes.
  const constraints = intent.ok ? (/## Constraints\n([\s\S]*?)(\n## |$)/.exec(intent.value.body)?.[1] ?? '').split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean) : [];
  const all = JSON.stringify(p);
  for (const c of constraints) if ([...words(c)].filter((w) => w.length >= 5 && all.toLowerCase().includes(w)).length >= 2) checks.push({ kind: 'warn', text: `Intent constraint: ${c}` });
  if (!checks.some((c) => c.kind === 'error')) checks.push({ kind: 'ok', text: 'No open change request covers the same thing' });
  return checks;
}
