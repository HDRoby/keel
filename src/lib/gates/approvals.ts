// Approvals and the Go, Park or No-go decision (REQ-005), recorded in the documents and in git.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { loadContext, requiredFilled } from '../brainstorm/session';
import { progress } from '../brainstorm/review';
import { outOfDate } from '../changes/stale';
import { uncovered } from '../scenarios/store';
import type { DocumentStatus, Stage } from '../documents/types';
import { fail, type Result } from '../result';
import type { Store } from '../store/db';
import { createDocument, readDocument, saveDocument, type StoredDocument } from '../store/documents';
import { fromYamlDate, readConfig, today } from '../store/workspace';
import { readTemplate } from '../templates/library';
import { readbackState } from '../readback/changes';
import { renderTemplate } from '../templates/render';
import { gateFor, type Decision, type ProjectState } from './rules';

export type ApprovalAction = 'approve' | 'request-changes' | 'reject';

export interface Approval {
  action: ApprovalAction;
  by: string;
  date: string;
  comment: string;
  version: number;     // the version that was reviewed
}

export const APPROVABLE = { intent: 'docs/intent.md', spec: 'docs/spec.md', plan: 'docs/plan.md' } as const;
export type Approvable = keyof typeof APPROVABLE;

const STATUS_AFTER: Record<ApprovalAction, DocumentStatus> = { approve: 'approved', 'request-changes': 'draft', reject: 'closed' };
const VERB: Record<ApprovalAction, string> = { approve: 'Approved', 'request-changes': 'Changes requested', reject: 'Rejected' };

const approvalSchema = z.object({
  action: z.enum(['approve', 'request-changes', 'reject']),
  by: z.string(),
  date: z.preprocess(fromYamlDate, z.string()),
  comment: z.string(),
  version: z.number(),
});

/** The approvals recorded in a document's header, oldest first. */
export function approvalsOf(doc: StoredDocument): Approval[] {
  const parsed = z.array(approvalSchema).safeParse(doc.header.approvals ?? []);
  return parsed.success ? parsed.data : [];
}

/** Approve, request changes or reject: sets the status and records who, when and why. The version stays. */
export async function review(
  store: Store, document: Approvable,
  input: { action: ApprovalAction; by: string; comment: string },
): Promise<Result<StoredDocument, 'not-found' | 'locked' | 'invalid-input' | 'not-reviewable' | 'conflicts'>> {
  if (!input.by.trim()) return fail('invalid-input', 'Say who is reviewing');
  const gate = gateFor(projectState(store), document);
  if (!gate.available) return fail('locked', gate.reason ?? 'This stage is locked');
  const doc = readDocument(store, APPROVABLE[document]);
  if (!doc.ok) return fail('not-found', doc.message);
  if (doc.value.header.status === 'closed') return fail('not-reviewable', `${doc.value.header.id} was rejected and is closed`);
  // Owner decision: an approved document is not reopened by a review; it changes through a change request (CR-0003, Next).
  if (doc.value.header.status === 'approved') {
    return fail('not-reviewable', `${doc.value.header.id} is approved; changes to it go through a change request`);
  }
  const open = Array.isArray(doc.value.header.conflicts) ? doc.value.header.conflicts.length : 0;
  if (input.action === 'approve' && open > 0) {
    return fail('conflicts', `Resolve the ${open} open conflict${open === 1 ? '' : 's'} from the regeneration before approving`);
  }
  const approval: Approval = { action: input.action, by: input.by.trim(), date: today(store), comment: input.comment.trim(), version: doc.value.header.version };
  const saved = await saveDocument(store, APPROVABLE[document], {
    status: STATUS_AFTER[input.action],
    sameVersion: true,
    extra: { approvals: [...approvalsOf(doc.value), approval] },
    reason: `${VERB[input.action]} by ${approval.by}${approval.comment ? `: ${approval.comment}` : ''}`,
  });
  return saved.ok ? saved : fail('invalid-input', saved.message);
}

/** The Go, Park or No-go decisions in docs/decisions, oldest first. */
export function decisionsOf(dir: string): Decision[] {
  const folder = join(dir, 'docs', 'decisions');
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter((f) => f.endsWith('.md')).sort().flatMap((f) => {
    try {
      const decision = matter(readFileSync(join(folder, f), 'utf8'), {}).data.decision;
      return decision === 'go' || decision === 'park' || decision === 'no-go' ? [decision as Decision] : [];
    } catch {
      return [];
    }
  });
}

export const DECISION_TITLE: Record<Decision, string> = { go: 'Go', park: 'Park', 'no-go': 'No-go' };

/** Records a Go, Park or No-go decision as docs/decisions/NNNN-<decision>.md. */
export async function recordDecision(
  store: Store,
  input: { decision: Decision; by: string; reason: string; consequences: string },
): Promise<Result<StoredDocument, 'locked' | 'invalid-input'>> {
  const gate = gateFor(projectState(store), 'spec');
  if (!gate.available) return fail('locked', gate.reason ?? 'The spec stage is locked');
  const [by, reason, consequences] = [input.by.trim(), input.reason.trim(), input.consequences.trim()];
  if (!by || !reason) return fail('invalid-input', 'Say who decided and why');
  const label = DECISION_TITLE[input.decision];
  const title = `${label} decision`;
  const template = readTemplate(store.root, 'decision-record');
  const body = template.ok
    ? renderTemplate(template.value.content, { title }).body
        .replace(/## Decision\n<!--[^\n]*-->/, `## Decision\n\n${label}, decided by ${by}.`)
        .replace(/## Reason\n<!--[^\n]*-->/, `## Reason\n\n${reason}`)
        .replace(/## Consequences\n<!--[^\n]*-->/, consequences ? `## Consequences\n\n${consequences}` : '$&')
    : `# ${title}\n\n## Decision\n\n${label}\n\n## Reason\n\n${reason}\n`;
  const created = await createDocument(store, {
    kind: 'decision', title, body, template: template.ok ? `decision-record@${template.value.version}` : 'decision-record@1',
    status: 'approved', fileSlug: input.decision, extra: { decision: input.decision, decided_by: by },
  });
  return created.ok ? created : fail('invalid-input', created.message);
}

/** Everything the gates need, read from the project. */
export function projectState(store: Store): ProjectState {
  const status = (path: string) => {
    const doc = readDocument(store, path);
    return doc.ok ? doc.value.header.status : undefined;
  };
  const context = loadContext(store);
  return {
    requiredCaptured: context.ok && requiredFilled(context.value),
    intent: status(APPROVABLE.intent),
    spec: status(APPROVABLE.spec),
    plan: status(APPROVABLE.plan),
    decisions: decisionsOf(store.root),
    uncovered: uncovered(store.root),
  };
}

export interface StageSummary {
  detail: string;   // the second line in the stage bar, e.g. "intent.md v2 · Approved"
  done: boolean;
  outOfDate?: string[];   // approved, significant change requests not applied yet (REQ-005, CR-0003)
}

const STATUS_WORD: Record<string, string> = { draft: 'Draft', pending: 'Pending', approved: 'Approved', closed: 'Rejected' };
const DECISION_WORD: Record<Decision, string> = { go: 'Go decision', park: 'Parked', 'no-go': 'No-go' };

/** What each stage has so far, for the stage bar. */
export function stageSummaries(store: Store): Record<Stage, StageSummary> {
  const doc = (path: string) => {
    const d = readDocument(store, path);
    return d.ok ? d.value.header : undefined;
  };
  const context = loadContext(store);
  const required = context.ok ? context.value.sections.filter((s) => s.required) : [];
  const captured = context.ok ? progress(context.value).filled : 0;
  const intent = doc(APPROVABLE.intent);
  const spec = doc(APPROVABLE.spec);
  const plan = doc(APPROVABLE.plan);
  const decision = decisionsOf(store.root).at(-1);
  const docLine = (name: string, header?: { version: number; status: string }) => (header ? `${name} v${header.version} · ${STATUS_WORD[header.status] ?? header.status}` : `No ${name} yet`);
  const summaries: Record<Stage, StageSummary> = {
    explore: {
      detail: !context.ok ? 'No brainstorm' : captured === required.length ? 'Brainstorm · all required sections' : `Brainstorm · ${captured} of ${required.length} required sections`,
      done: context.ok && captured === required.length,
    },
    intent: { detail: docLine('intent.md', intent), done: intent?.status === 'approved' },
    spec: { detail: `${spec ? `spec.md v${spec.version}` : 'No spec.md yet'} · ${decision ? DECISION_WORD[decision] : 'no decision'}`, done: decision === 'go' },
    plan: { detail: docLine('plan.md', plan), done: plan?.status === 'approved' },
    handoff: (() => {
      // Written once Handoff has put its files in the folder (handoff.files in config.yml, task R7).
      const handoff = readConfig(store.root)?.handoff as { files?: Record<string, string> } | undefined;
      if (!handoff?.files || Object.keys(handoff.files).length === 0) return { detail: 'Ready to hand off', done: false };
      const waiting = readbackState(store).pending.length;
      return { detail: `Written to this folder · ${waiting === 0 ? 'no changes to review' : `${waiting} change${waiting === 1 ? '' : 's'} to review`}`, done: true };
    })(),
  };
  const stale = outOfDate(store);
  for (const stage of ['intent', 'spec', 'plan', 'handoff'] as const) {
    const ids = stale[stage];
    if (ids?.length) summaries[stage] = { ...summaries[stage], outOfDate: ids };
  }
  return summaries;
}
