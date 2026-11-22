// The baseline's current stack as a recorded decision (REQ-012, CR-0010): when the spec of a project that started
// from a baseline is generated, "Keep current: <stack>" is decided for Language and framework, with a record saying
// it was recorded from the existing code rather than chosen. The user can change it like any decision.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDesign } from '../decisions/design';
import { decide } from '../decisions/records';
import type { Store } from '../store/db';
import { BASELINE_FILE } from './draft';

export async function recordBaselineDecisions(store: Store): Promise<string[]> {
  const file = join(store.root, BASELINE_FILE);
  if (!existsSync(file)) return [];
  let stack: string | undefined;
  try {
    stack = (JSON.parse(readFileSync(file, 'utf8')) as { stack?: string }).stack;
  } catch {
    return [];
  }
  if (!stack) return [];
  const topic = readDesign(store.root).topics.find((t) => t.id === 'language-and-framework');
  const keep = topic?.options.find((o) => o.name.toLowerCase().startsWith('keep current'));
  if (!topic || !keep || topic.chosen) return [];
  const decided = await decide(store, topic.id, { chosen: keep.id, reason: `Recorded from the existing code (baseline): the project already uses ${stack}.` });
  return decided.ok && 'record' in decided.value ? [decided.value.record] : [];
}
