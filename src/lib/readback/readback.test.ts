import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recordDecision, review } from '../gates/approvals';
import { generatePlan } from '../generate/plan';
import { generateSpec } from '../generate/spec';
import { createDocument, readDocument, saveDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject, readConfig } from '../store/workspace';
import { acceptChange, dismissChange, readbackState, WORKING_TREE } from './changes';
import { checkAll, checkFolder, isKeelCommit, isWatched, pendingFrom, statusPaths } from './check';
import { readbackInterval, startReadbackSchedule, stopReadbackSchedule } from './schedule';

const AGENT = ['-c', 'user.name=Coding Agent', '-c', 'user.email=agent@example.com'];

async function approvedPlan() {
  const store = tempStore();
  const silent = async () => undefined;
  await initialiseProject(store, { title: 'Demo', author: 'Ada' });
  await createDocument(store, { kind: 'intent', title: 'Demo', template: 'standard-intent@3', body: '## Requirements\n\n- REQ-001 Show the run command\n' });
  await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
  await generateSpec(store, 'requirements-and-design-spec@2', silent);
  await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Yes', consequences: '' });
  await generatePlan(store, silent);
  await review(store, 'plan', { action: 'approve', by: 'Ada', comment: '' });
  const git = (...args: string[]) => execFileSync('git', [...AGENT, ...args], { cwd: store.root, encoding: 'utf8' }).trim();
  const edit = (path: string, change: (text: string) => string) => {
    const file = join(store.root, path);
    writeFileSync(file, change(readFileSync(file, 'utf8')));
  };
  return { store, git, edit };
}

afterEach(() => stopReadbackSchedule());

describe('pendingFrom and isKeelCommit', () => {
  it('ignores Keel commits, keeps the latest agent commit per document or scenario file, and skips handled ones', () => {
    const commit = (hash: string, subject: string, paths: string[], email = 'agent@example.com') => ({ hash, author: 'Agent', email, date: '2026-11-22T10:00:00Z', subject, paths });
    expect(isKeelCommit({ email: 'keel@localhost', subject: 'x', author: 'Keel' })).toBe(true);
    expect(isKeelCommit({ email: 'a@b.c', subject: 'Keel: handoff', author: 'Ada' })).toBe(true);
    expect(isWatched('features/demo.feature')).toBe(true);
    expect(isWatched('features/steps/demo.steps.ts')).toBe(false);
    expect(isWatched('src/app.ts')).toBe(false);
    const pending = pendingFrom([
      commit('a1', 'Plan tweak', ['docs/plan.md', 'src/x.ts']),
      commit('k1', 'Keel: PLN-0001 v2: x', ['docs/plan.md'], 'keel@localhost'),
      commit('a2', 'Plan again', ['docs/plan.md', 'features/demo.feature']),
    ], [{ path: 'features/demo.feature', commit: 'a2', outcome: 'dismissed' }]);
    expect(pending).toEqual([{ path: 'docs/plan.md', commit: 'a2', messages: ['Plan tweak', 'Plan again'], author: 'Agent', date: '2026-11-22T10:00:00Z' }]);
    expect(statusPaths(' M docs/plan.md\n?? tasks/T9.md\nR  docs/a.md -> docs/b.md\n')).toEqual(['docs/plan.md', 'tasks/T9.md', 'docs/b.md']);
  });
});

describe('checkFolder, acceptChange and dismissChange', () => {
  it('finds nothing after Keel\'s own work, then an agent commit, and accepts it as the next version in draft', async () => {
    const { store, git, edit } = await approvedPlan();
    await saveDocument(store, 'docs/spec.md', { reason: 'Keel edit', body: 'Spec.\n' });
    expect(await checkFolder(store)).toMatchObject({ ok: true, value: { pending: [] } });

    edit('docs/plan.md', (t) => t.replace('## Risks', '## Risks\n\n- The run command differs per operating system.\n'));
    git('commit', '-qam', 'Split T1');
    const checked = await checkFolder(store);
    expect(checked.ok && checked.value.pending).toEqual([expect.objectContaining({ path: 'docs/plan.md', messages: ['Split T1'], author: 'Coding Agent' })]);
    // The check is volatile: nothing is committed for it.
    expect(git('log', '-1', '--format=%s')).toBe('Split T1');

    const accepted = await acceptChange(store, 'docs/plan.md');
    expect(accepted).toMatchObject({ ok: true, value: { header: { version: 2, status: 'draft' } } });
    const plan = readDocument(store, 'docs/plan.md');
    expect(plan.ok && plan.value.body).toContain('differs per operating system');
    expect(git('log', '-2', '--format=%an|%s')).toMatch(/^Keel\|Keel: read-back of docs\/plan.md|^Keel\|Keel: accept read-back/);
    expect(store.index.versions('PLN-0001').at(-1)?.reason).toMatch(/^Read back from [0-9a-f]{7}: Split T1 \(back to draft for approval\)$/);
    expect(readbackState(store).pending).toEqual([]);
    expect(readConfig(store.root)?.readback).toMatchObject({ base: git('rev-parse', 'HEAD~1'), handled: [] });
    expect(await checkFolder(store)).toMatchObject({ ok: true, value: { pending: [] } });
  });

  it('shows an uncommitted edit, and accepting it commits it as Keel', async () => {
    const { store, git, edit } = await approvedPlan();
    edit('tasks/T1.md', (t) => `${t}\nOne more step.\n`);
    const checked = await checkFolder(store);
    expect(checked.ok && checked.value.pending).toEqual([expect.objectContaining({ path: 'tasks/T1.md', commit: WORKING_TREE, messages: ['Uncommitted edit'] })]);
    expect(await acceptChange(store, 'tasks/T1.md')).toMatchObject({ ok: true, value: { header: { version: 2 } } });
    expect(git('status', '--porcelain', '--', 'tasks')).toBe('');
    expect(git('log', '-1', '--format=%an|%s')).toBe('Keel|Keel: accept read-back of tasks/T1.md');
    expect(store.index.versions('T1').at(-1)?.reason).toBe('Read back uncommitted edit');
  });

  it('dismissing puts Keel\'s version back; a new task the agent wrote can be accepted as it is', async () => {
    const { store, git, edit } = await approvedPlan();
    const original = readFileSync(join(store.root, 'docs/plan.md'), 'utf8');
    edit('docs/plan.md', (t) => `${t}\nAgent note.\n`);
    git('commit', '-qam', 'Agent note');
    const task = readFileSync(join(store.root, 'tasks/T1.md'), 'utf8').replace(/^id: T1$/m, 'id: T9').replace(/T1 ·/g, 'T9 ·');
    mkdirSync(join(store.root, 'tasks'), { recursive: true });
    writeFileSync(join(store.root, 'tasks/T9.md'), task);
    const checked = await checkFolder(store);
    expect(checked.ok && checked.value.pending.map((c) => c.path).sort()).toEqual(['docs/plan.md', 'tasks/T9.md']);
    expect(await dismissChange(store, 'docs/plan.md')).toMatchObject({ ok: true });
    expect(readFileSync(join(store.root, 'docs/plan.md'), 'utf8')).toBe(original);
    expect(await acceptChange(store, 'tasks/T9.md')).toMatchObject({ ok: true, value: { header: { id: 'T9' } } });
    expect(await checkFolder(store)).toMatchObject({ ok: true, value: { pending: [] } });
    expect(await acceptChange(store, 'docs/plan.md')).toMatchObject({ error: 'not-found' });
  });

  it('does not show a file the agent changed back to Keel\'s version', async () => {
    const { store, git, edit } = await approvedPlan();
    edit('docs/plan.md', (t) => `${t}\nTemporary.\n`);
    git('commit', '-qam', 'Try');
    edit('docs/plan.md', (t) => t.replace('\nTemporary.\n', ''));
    git('commit', '-qam', 'Undo');
    expect(await checkFolder(store)).toMatchObject({ ok: true, value: { pending: [] } });
  });

  it('reads CI results only for a GitHub remote with a token', async () => {
    const { store, git } = await approvedPlan();
    const checked = await checkFolder(store);
    expect(checked.ok && checked.value.ciNote).toBe('CI results are read from a GitHub remote only');
    git('remote', 'add', 'origin', 'https://github.com/acme/demo.git');
    const noToken = await checkFolder(store);
    expect(noToken.ok && noToken.value.ciNote).toBe('Add a GitHub token in Settings to see CI results');
  });

  it('needs an initialised folder, and checks on a schedule of KEEL_READBACK_SECONDS', async () => {
    const store = tempStore();
    expect(await checkFolder(store)).toMatchObject({ error: 'not-initialised' });
    expect(await checkAll(store)).toBe('not initialised');
    expect(readbackInterval({})).toBe(60);
    expect(readbackInterval({ KEEL_READBACK_SECONDS: '5' })).toBe(5);
    expect(readbackInterval({ KEEL_READBACK_SECONDS: 'soon' })).toBe(60);
    expect(startReadbackSchedule(() => store, { KEEL_READBACK_SECONDS: '0' })).toBe(false);
    expect(startReadbackSchedule(() => store, { KEEL_READBACK_SECONDS: '30' })).toBe(true);
    expect(startReadbackSchedule(() => store, { KEEL_READBACK_SECONDS: '30' })).toBe(false);
  });
});
