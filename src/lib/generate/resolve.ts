// Resolving the conflicts a regeneration raised (owner decision, T6). Approval waits until none are left.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { createDocument, readDocument, saveDocument, type StoredDocument } from '../store/documents';
import { commitFiles, removeFiles } from '../store/git';
import { projectDir } from '../store/workspace';
import { projectState } from '../gates/approvals';
import { gateFor } from '../gates/rules';
import { readTemplate } from '../templates/library';
import { setSection, type Conflict } from './merge';

export type Resolution = { name: string; choice: 'mine' | 'theirs' | 'merged'; merged?: string };

const conflictSchema = z.object({
  kind: z.enum(['section', 'file']),
  name: z.string(),
  mine: z.string(),
  theirs: z.string(),
  title: z.string().optional(),
  requirements: z.array(z.string()).optional(),
});

/** The open conflicts recorded in a spec's or plan's header. */
export function conflictsOf(doc: StoredDocument): Conflict[] {
  const parsed = z.array(conflictSchema).safeParse(doc.header.conflicts ?? []);
  return parsed.success ? parsed.data : [];
}

const PATHS = { spec: 'docs/spec.md', plan: 'docs/plan.md' } as const;

/** Applies the chosen side, or a merged text, for each conflict, and saves the result as the next version. */
export async function resolveConflicts(
  store: Store, slug: string, document: keyof typeof PATHS, resolutions: Resolution[],
): Promise<Result<StoredDocument, 'not-found' | 'invalid-input' | 'locked'>> {
  const gate = gateFor(projectState(store, slug), document);
  if (!gate.available) return fail('locked', gate.reason ?? 'This stage is locked');
  const doc = readDocument(store, slug, PATHS[document]);
  if (!doc.ok) return fail('not-found', doc.message);
  const open = conflictsOf(doc.value);
  const unknown = resolutions.filter((r) => !open.some((c) => c.name === r.name));
  if (unknown.length > 0) return fail('invalid-input', `No open conflict for ${unknown.map((r) => r.name).join(', ')}`);
  const dir = projectDir(slug, store.home);
  let body = doc.value.body;
  // The version this resolution saves, which task files then point to.
  const nextRef = `${doc.value.header.id}@${doc.value.header.version + 1}`;
  const taskTemplate = readTemplate(store.home, 'task');
  const taskTemplateRef = taskTemplate.ok ? `task@${taskTemplate.value.version}` : 'task@1';
  const done: string[] = [];

  for (const conflict of open) {
    const resolution = resolutions.find((r) => r.name === conflict.name);
    if (!resolution) continue;
    const text = resolution.choice === 'mine' ? conflict.mine : resolution.choice === 'theirs' ? conflict.theirs : (resolution.merged ?? '');
    if (conflict.kind === 'section') {
      body = setSection(body, conflict.name, text);
    } else if (/^tasks\/T\d+\.md$/.test(conflict.name)) {
      const task = readDocument(store, slug, conflict.name);
      const id = conflict.name.slice(6, -3);
      if (!text.trim()) {
        if (task.ok) await removeFiles(dir, [conflict.name], `${id}: removed when resolving ${doc.value.header.id}`);
      } else if (task.ok) {
        await saveDocument(store, slug, conflict.name, {
          body: text, reason: `Resolved with ${doc.value.header.id}: ${resolution.choice}`,
          ...(resolution.choice === 'theirs' && conflict.requirements
            ? { title: conflict.title, extra: { plan: nextRef, requirements: conflict.requirements } }
            : { extra: { plan: nextRef } }),
        });
      } else {
        await createDocument(store, slug, {
          kind: 'task', id, title: conflict.title ?? id, body: text, template: taskTemplateRef, status: 'todo',
          extra: { plan: nextRef, requirements: conflict.requirements ?? [] },
        });
      }
    } else if (/^features\/[\w.-]+\.feature$/.test(conflict.name)) {
      writeFileSync(join(dir, conflict.name), text);
      await commitFiles(dir, [conflict.name], `${conflict.name}: resolved with ${doc.value.header.id}: ${resolution.choice}`);
    }
    done.push(`${conflict.name} (${resolution.choice})`);
  }

  const remaining = open.filter((c) => !resolutions.some((r) => r.name === c.name));
  const saved = await saveDocument(store, slug, PATHS[document], {
    body, extra: { conflicts: remaining },
    reason: `Resolved conflicts: ${done.join(', ')}${remaining.length ? `; ${remaining.length} still open` : ''}`,
  });
  return saved.ok ? ok(saved.value) : fail('invalid-input', saved.message);
}
