import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recordDecision, review } from '../gates/approvals';
import { generatePlan } from '../generate/plan';
import { generateSpec } from '../generate/spec';
import { pushHandoff } from '../github/push';
import { buildHandoff } from '../handoff/scaffold';
import { ensureSeed } from '../seed';
import { createDocument, readDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { acceptChange, dismissChange, readbackState } from './changes';
import { checkAll, checkRepository, isKeelCommit, pendingFrom } from './poll';
import { readbackInterval, startReadbackSchedule, stopReadbackSchedule } from './schedule';

const LOCAL = { KEEL_ALLOW_LOCAL_REMOTES: '1' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

async function pushed() {
  const store = tempStore();
  ensureSeed(store.root, join(process.cwd(), 'seed'));
  const silent = async () => undefined;
  await initialiseProject(store, { title: 'Demo', author: 'Ada' });
  await createDocument(store, { kind: 'intent', title: 'Demo', template: 'standard-intent@3', body: '## Requirements\n\n- REQ-001 Show the run command\n' });
  await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
  await generateSpec(store, 'requirements-and-design-spec@2', silent);
  await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Yes', consequences: '' });
  await generatePlan(store, silent);
  await review(store, 'plan', { action: 'approve', by: 'Ada', comment: '' });
  const remote = join(mkdtempSync(join(tmpdir(), 'keel-remote-')), 'repo.git');
  execFileSync('git', ['init', '-q', '--bare', '--initial-branch=main', remote]);
  const built = await buildHandoff(store);
  if (!built.ok) throw new Error(built.message);
  await pushHandoff(store, { kind: 'local', path: remote, branch: 'main' }, built.value, 'PLN-0001@1', { env: LOCAL });
  const agent = mkdtempSync(join(tmpdir(), 'keel-agent-'));
  git(agent, 'clone', '-q', remote, '.');
  const commit = (message: string, change: () => void, who = ['-c', 'user.name=Agent', '-c', 'user.email=agent@example.com']) => {
    change();
    git(agent, 'add', '-A');
    git(agent, ...who, 'commit', '-qm', message);
    git(agent, 'push', '-q', 'origin', 'main');
  };
  const edit = (path: string, from: string, to: string) => writeFileSync(join(agent, path), readFileSync(join(agent, path), 'utf8').replace(from, to));
  return { store, agent, commit, edit };
}

afterEach(() => stopReadbackSchedule());

describe('pendingFrom', () => {
  const c = (hash: string, subject: string, paths: string[], email = 'a@b') => ({ hash, author: 'Agent', email, date: '2026-11-20T10:00:00Z', subject, paths });

  it('keeps one change per document, with every message, and skips Keel commits, other files and dismissed ones', () => {
    const pending = pendingFrom([
      c('a1', 'Edit plan', ['docs/plan.md', 'src/app.ts']), c('b2', 'Keel: handoff', ['docs/spec.md'], 'keel@localhost'),
      c('c3', 'Edit plan again', ['docs/plan.md']), c('d4', 'Edit task', ['tasks/T1.md']),
    ], [{ path: 'tasks/T1.md', commit: 'd4', outcome: 'dismissed' }]);
    expect(pending).toEqual([{ path: 'docs/plan.md', commit: 'c3', messages: ['Edit plan', 'Edit plan again'], author: 'Agent', date: '2026-11-20T10:00:00Z' }]);
    expect(isKeelCommit({ email: 'x@y', subject: 'Keel: handoff', author: 'Someone' })).toBe(true);
  });
});

describe('checkRepository, acceptChange and dismissChange', () => {
  it('finds the agent changes since the push, accepts one as a new version and dismisses another until it changes again', async () => {
    const { store, agent, commit, edit } = await pushed();
    const agentDir = () => agent;
    expect(await checkRepository(store)).toMatchObject({ ok: true, value: { pending: [] } });
    commit('Add a risk', () => edit('docs/plan.md', '## Risks', '## Risks\n\n- Agent risk.\n'));
    commit('Note on T1', () => edit('tasks/T1.md', '## Notes', '## Notes\n\nAgent note.\n'));
    commit('Add code', () => { mkdirSync(join(agentDir(), 'src'), { recursive: true }); writeFileSync(join(agentDir(), 'src/app.ts'), 'code'); });
    const checked = await checkRepository(store);
    expect(checked.ok && checked.value.pending.map((p) => [p.path, p.messages])).toEqual([['docs/plan.md', ['Add a risk']], ['tasks/T1.md', ['Note on T1']]]);

    const accepted = await acceptChange(store, 'docs/plan.md');
    // Owner decision: an accepted change to an approved document goes back to draft for a new approval.
    expect(accepted).toMatchObject({ ok: true, value: { header: { version: 2, status: 'draft' } } });
    expect(accepted.ok && accepted.value.body).toContain('- Agent risk.');
    expect(store.index.versions('PLN-0001').at(-1)?.reason).toMatch(/^Read back from [0-9a-f]{7}: Add a risk \(back to draft for approval\)$/);
    expect(readbackState(store).ciNote).toBe('CI results are read from GitHub repositories only');

    expect(await dismissChange(store, 'tasks/T1.md')).toMatchObject({ ok: true });
    expect((await checkRepository(store)).ok && readbackState(store).pending).toEqual([]);
  });

  it('shows a dismissed file again after a new commit, and takes a new task file the agent added', async () => {
    const { store, agent, commit, edit } = await pushed();
    commit('Note on T1', () => edit('tasks/T1.md', '## Notes', '## Notes\n\nOne.\n'));
    await checkRepository(store);
    await dismissChange(store, 'tasks/T1.md');
    commit('Second note', () => edit('tasks/T1.md', 'One.', 'Two.'));
    const t1 = readFileSync(join(agent, 'tasks/T1.md'), 'utf8');
    commit('Add T9', () => writeFileSync(join(agent, 'tasks/T9.md'), t1.replace('id: T1', 'id: T9').replace('# T1', '# T9')));
    const checked = await checkRepository(store);
    expect(checked.ok && checked.value.pending.map((p) => [p.path, p.messages])).toEqual([['tasks/T1.md', ['Note on T1', 'Second note']], ['tasks/T9.md', ['Add T9']]]);
    expect(await acceptChange(store, 'tasks/T9.md')).toMatchObject({ ok: true, value: { header: { id: 'T9' } } });
    expect(readDocument(store, 'tasks/T9.md').ok).toBe(true);
    expect(await acceptChange(store, 'tasks/T9.md')).toMatchObject({ error: 'not-found' });
  });

  it('refuses projects that were never pushed, and checks only pushed ones on the schedule', async () => {
    const store = tempStore();
    await initialiseProject(store, { title: 'Quiet', author: 'Ada' });
    expect(await checkRepository(store)).toMatchObject({ error: 'not-pushed' });
    expect(await checkAll(store)).toBe('not pushed');
    expect(readbackInterval({})).toBe(15);
    expect(readbackInterval({ KEEL_READBACK_MINUTES: '5' })).toBe(5);
    expect(readbackInterval({ KEEL_READBACK_MINUTES: 'soon' })).toBe(15);
    expect(startReadbackSchedule(() => store, { KEEL_READBACK_MINUTES: '0' })).toBe(false);
    expect(startReadbackSchedule(() => store, {})).toBe(true);
    expect(startReadbackSchedule(() => store, {})).toBe(false);
  });
});
