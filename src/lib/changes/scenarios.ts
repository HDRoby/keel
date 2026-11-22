// Scenario edits after the spec is approved become a change request (REQ-004, REQ-005, CR-0006 on CR-0003):
// the held feature files with their before and after, waiting for approval. Approving writes them.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { readDocument } from '../store/documents';
import { createChange, readChange, updateKeelChange } from './store';

const fence = (text: string) => `\`\`\`gherkin\n${text.trimEnd()}\n\`\`\``;

export async function raiseScenarioChange(store: Store, input: { files: Record<string, string>; requirements: string[]; existing?: string }): Promise<Result<string, string>> {
  const spec = readDocument(store, 'docs/spec.md');
  const ref = spec.ok ? `${spec.value.header.id}@${spec.value.header.version}` : 'SPC-0001';
  const requirements = [...new Set(input.requirements)].sort();
  const title = 'Change to the acceptance scenarios';
  const body = [
    `# ${title}`, '',
    '## What changed', '',
    `Upstream document: ${ref} (approved). The scenarios below are written to \`features/\` when this change request is approved.`, '',
    ...Object.entries(input.files).flatMap(([file, after]) => {
      const before = existsSync(join(store.root, file)) ? readFileSync(join(store.root, file), 'utf8') : '';
      return [`### ${file}`, '', 'Before:', '', before ? fence(before) : '_New file._', '', 'After:', '', fence(after), ''];
    }),
    '## Reason', '', 'Acceptance scenarios edited in the Spec after it was approved.', '',
  ].join('\n');
  const fields = { title, size: 'minor' as const, affects: [ref], requirements, source: 'docs/spec.md', scenario_change: true };
  const existing = input.existing ? readChange(store.root, input.existing) : undefined;
  const saved = existing && existing.origin === 'keel' && (existing.status === 'draft' || existing.status === 'waiting')
    ? await updateKeelChange(store, existing, fields, body, `Update ${existing.id}: scenarios`)
    : await createChange(store, { ...fields, reason: 'Scenarios edited after the spec was approved.', status: 'waiting', body, extra: { scenario_change: true } });
  return saved.ok ? ok(saved.value.id) : fail(saved.error, saved.message);
}
