import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Writer } from '../generate/writer';
import { fakeReply } from '../providers/fake';
import { createDocument } from '../store/documents';
import { commitFiles } from '../store/git';
import { tempStore } from '../store/test-store';
import { initialiseProject, readConfig, updateConfig } from '../store/workspace';
import { draftChange } from './draft';
import { approveChange, packageFiles, writePackage } from './flow';
import { changesIndex } from './index-file';
import { idClashes, nextFreeRequirement, renumberRequirement, suggestDependsOn } from './links';
import { nextTaskNumber, planChange, readPlan, settlePlannedScenario } from './plan';
import { createChange, listChanges, readChange } from './store';

const fake: Writer = async (_t, messages) => fakeReply('anthropic', messages);

async function project() {
  const store = tempStore();
  await initialiseProject(store, { title: 'Keel', author: 'Ada' });
  for (const path of ['src/lib/providers/registry.ts', 'src/lib/providers/ollama-models.ts', 'src/app/settings/page.tsx', 'src/lib/store/db.ts']) {
    mkdirSync(join(store.root, path, '..'), { recursive: true });
    writeFileSync(join(store.root, path), '// code\n');
  }
  mkdirSync(join(store.root, 'tasks'), { recursive: true });
  writeFileSync(join(store.root, 'tasks', 'R18.md'), '# R18\n');
  await commitFiles(store.root, ['src', 'tasks'], 'Code');
  await createDocument(store, { kind: 'intent', title: 'Keel', template: 'standard-intent@3', status: 'approved', body: '## Requirements\n\n- REQ-009 Any model provider, with Ollama as the default\n' });
  return store;
}

describe('a change request from the template', () => {
  it('writes the chosen template with Why, the drafted sections marked, and the requirement and impact tables', async () => {
    const store = await project();
    const draft = await draftChange(fake, { title: 'Ollama is the default provider', reason: 'Free and private.', requirements: ['REQ-009'] });
    expect(draft).toEqual({ why: 'Free and private.', whatChanges: '1. Ollama is the default provider.', doneWhen: '- npm run verify passes.\n- The behaviour above works as described.' });
    const made = await createChange(store, { title: 'Ollama is the default provider', reason: 'Free and private.', requirements: ['REQ-009'], impact: [{ document: 'docs/spec.md', decision: 'pending' }], draft });
    if (!made.ok) throw new Error(made.message);
    const text = readFileSync(join(store.root, made.value.file), 'utf8');
    expect(text).toContain('template: change-request@2');
    expect(text).toContain('# CR-0001: Ollama is the default provider');
    expect(text).toContain('## What changes\n\n1. Ollama is the default provider.\n\n_Drafted by the assistant: edit it before approval._');
    expect(text).toContain('| REQ-009 | _Not written yet._ |');
    expect(text).toContain('| `docs/spec.md` | REQ-009 | Out of date until resolved: Update, Still valid or Later |');
    expect(await draftChange(async () => undefined, { title: 'X', reason: '', requirements: [] })).toEqual({});
  });
});

describe('planChange and the package', () => {
  it('plans new tasks after the highest R number with files from the code map, and writes the package from the templates', async () => {
    const store = await project();
    await createChange(store, { title: 'Ollama is the default provider', reason: 'Free.', status: 'approved', requirements: ['REQ-009'], impact: [] });
    expect(nextTaskNumber(store.root)).toBe(19);
    const sent: string[] = [];
    const planned = await planChange(store, 'CR-0001', { share: ['src/lib/store/db.ts'] }, async (task, messages) => { sent.push(messages.at(-1)?.content ?? ''); return fake(task, messages); });
    if (!planned.ok) throw new Error(planned.message);
    expect(planned.value.tasks.map((t) => [t.id, t.files])).toEqual([['R19', ['src/lib/providers/ollama-models.ts', 'src/lib/providers/registry.ts']]]);
    expect(JSON.parse(sent[0] ?? '{}')).toMatchObject({ files: [], firstTaskId: 'R19' });   // names only: no file content
    expect(planned.value.scenarios).toEqual([expect.objectContaining({ id: 'S1', req: 'REQ-009', state: 'suggested' })]);
    expect(nextTaskNumber(store.root)).toBe(20);
    await settlePlannedScenario(store, 'CR-0001', 'S1', 'accepted');
    expect(readPlan(store.root, 'CR-0001')?.scenarios[0]?.state).toBe('accepted');

    const files = packageFiles(store, readChange(store.root, 'CR-0001') as never);
    expect(files.map((f) => f.path)).toEqual(['changes/CR-0001/PROMPT.md', 'changes/CR-0001/tasks/R19.md', 'changes/CR-0001/features/ollama-is-the-default-provider.feature']);
    const [prompt, task, feature] = files.map((f) => f.content);
    expect(prompt).toContain('Implement R19 in order, with failing scenarios first');
    expect(prompt).toContain('commit each one as `<task ID>: <task title>`');
    expect(prompt).toContain('Keep `npm run verify` green after each task');
    expect(task).toContain('change: CR-0001');
    expect(task).toContain('# R19 · Ollama is the default provider');
    expect(task).toContain('- `src/lib/providers/registry.ts`');
    expect(task).toContain('features/ollama-is-the-default-provider.feature` › ');
    expect(task).toContain('## As built');
    expect(feature).toContain('  @REQ-009\n  Scenario: ');
    const written = await writePackage(store, 'CR-0001');
    expect(written.ok).toBe(true);
    expect(readFileSync(join(store.root, 'changes/CR-0001/CR-0001.md'), 'utf8')).toContain('- tasks/R19.md');
    expect(existsSync(join(store.root, 'changes/README.md'))).toBe(true);
  });

  it('with the code map off, sends no names and leaves the files to the coding agent', async () => {
    const store = await project();
    await updateConfig(store, { code_map: 'off' }, 'Off');
    await createChange(store, { title: 'Ollama', reason: '', status: 'approved', requirements: ['REQ-009'], impact: [] });
    const planned = await planChange(store, 'CR-0001', {}, fake);
    expect(planned.ok && planned.value.tasks[0]?.files).toEqual(['To be decided by the coding agent.']);
    expect(await planChange(store, 'CR-0001', {}, async () => 'not json')).toMatchObject({ error: 'failed' });
  });
});

describe('dependencies, ID clashes and the changes index', () => {
  it('suggests depends_on, flags a clash and renumbers the later request, and keeps changes/README.md in order', async () => {
    const store = await project();
    await createChange(store, { title: 'Export to PDF', reason: '', status: 'waiting', requirements: ['REQ-016 (new)'], affects: ['SPC-0001@3'] });
    await createChange(store, { title: 'Export to Excel', reason: '', status: 'waiting', requirements: ['REQ-016 (new)'], affects: ['SPC-0001@4'], dependsOn: [] });
    const all = listChanges(store.root);
    expect(suggestDependsOn(all[1] as never, all)).toEqual(['CR-0001']);
    expect(nextFreeRequirement(store.root, all)).toBe('REQ-017');
    expect(idClashes(store.root, all)).toEqual([{ req: 'REQ-016', ids: ['CR-0001', 'CR-0002'], later: 'CR-0002', next: 'REQ-017', message: 'REQ-016 is named as new by CR-0001 and CR-0002.' }]);
    expect((await renumberRequirement(store, 'CR-0002', 'REQ-016', 'REQ-017')).ok).toBe(true);
    expect(idClashes(store.root, listChanges(store.root))).toEqual([]);

    expect(readFileSync(join(store.root, 'changes/README.md'), 'utf8')).toContain('| 2 | [CR-0002](CR-0002/CR-0002.md) | Export to Excel |');
    await approveChange(store, 'CR-0001', 'Ada');
    expect(changesIndex(store)).toMatch(/\| 1 \| \[CR-0002\].*Waiting for approval \|\n\| 2 \| \[CR-0001\].*\|/);
    await updateConfig(store, { changes_index: 'off' }, 'Off');
    expect(readConfig(store.root)?.changes_index).toBe('off');
  });
});
