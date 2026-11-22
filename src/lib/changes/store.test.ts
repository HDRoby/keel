import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { computeStatus, createChange, dependencyOrder, listChanges, nextNumber, nextToApply, progressLabel, setChangeStatus, type ChangeRequest } from './store';

/** A copy of this repository's own changes/ and tasks/ folders: CR-0003 to CR-0012, as written by hand. */
function realChanges(): string {
  const root = mkdtempSync(join(tmpdir(), 'keel-changes-'));
  // Only CR-0003 to CR-0012: requests the owner adds later do not change what this test checks.
  const later = /changes\/CR-(\d{4})/;
  cpSync(join(process.cwd(), 'changes'), join(root, 'changes'), { recursive: true, filter: (src) => Number(later.exec(src)?.[1] ?? 0) <= 12 });
  cpSync(join(process.cwd(), 'tasks'), join(root, 'tasks'), { recursive: true });
  return root;
}

const cr = (id: string, extra: Partial<ChangeRequest> = {}): ChangeRequest => ({
  id, number: Number(id.slice(3)), folder: `changes/${id}`, file: `changes/${id}/${id}.md`, title: id, status: 'approved', affects: [], requirements: [],
  dependsOn: [], origin: 'hand', impact: [], tasks: [], hasPrompt: false, body: '', ...extra,
});

describe('listChanges on this repository\'s own change requests', () => {
  it('reads every hand-written request with its tasks, ignores README.md, and computes the statuses', () => {
    const root = realChanges();
    const all = listChanges(root);
    expect(all.map((c) => c.id)).toEqual(['CR-0003', 'CR-0004', 'CR-0005', 'CR-0006', 'CR-0007', 'CR-0008', 'CR-0009', 'CR-0010', 'CR-0011', 'CR-0012']);
    const status = (id: string) => computeStatus(all.find((c) => c.id === id) as ChangeRequest, all).label;
    expect(status('CR-0004')).toBe('Applied');
    expect(status('CR-0005')).toBe('Applied');
    expect(progressLabel(all.find((c) => c.id === 'CR-0004') as ChangeRequest)).toBe('9 of 9 tasks done');
    expect(status('CR-0003')).toMatch(/^(Approved · ready|In progress|Applied)$/);
    // The chain CR-0006 → CR-0012: each is applied, ready or in progress, or waits for the one before it.
    for (let n = 7; n <= 12; n += 1) {
      const id = `CR-00${String(n).padStart(2, '0')}`;
      const before = `CR-00${String(n - 1).padStart(2, '0')}`;
      expect(status(id), id).toMatch(new RegExp(`^(Applied|Approved · ready|In progress|Approved · waiting for ${before})$`));
    }
    expect(all.find((c) => c.id === 'CR-0004')).toMatchObject({ origin: 'hand', requirements: ['REQ-006', 'REQ-007', 'REQ-009', 'REQ-012'], hasPrompt: true });
    expect(all.find((c) => c.id === 'CR-0006')?.dependsOn).toEqual(['CR-0003']);
    // CR-0005's header has an unquoted colon in its title: read line by line instead of failing.
    expect(all.find((c) => c.id === 'CR-0005')).toMatchObject({ title: 'Explore: template sections with live comments from the assistant', status: 'approved', dependsOn: ['CR-0004'] });
    expect(all.every((c) => !c.error)).toBe(true);
  });

  it('lists a request whose header cannot be read, with the reason, instead of hiding it', () => {
    const root = realChanges();
    mkdirSync(join(root, 'changes', 'CR-0099'));
    writeFileSync(join(root, 'changes', 'CR-0099', 'CR-0099.md'), '---\nid: CR-0099\ntitle: [broken\n---\n');
    const all = listChanges(root);
    const broken = all.find((c) => c.id === 'CR-0099') as ChangeRequest;
    expect(computeStatus(broken, all)).toMatchObject({ kind: 'unreadable', label: expect.stringMatching(/^Cannot read header/) });
    expect(nextNumber(root)).toBe(100);
  });
});

describe('computeStatus and nextToApply', () => {
  it('follows the header, the requests it depends on, and its tasks', () => {
    const tasks = (done: number, total: number) => Array.from({ length: total }, (_, i) => ({ id: `R${i + 1}`, file: '', status: i < done ? 'done' : 'todo' }));
    const all = [
      cr('CR-0003', { tasks: tasks(0, 1) }),
      cr('CR-0004', { tasks: tasks(3, 9) }),
      cr('CR-0005', { dependsOn: ['CR-0003'], tasks: tasks(0, 1) }),
      cr('CR-0006', { status: 'draft' }),
      cr('CR-0007', { status: 'waiting' }),
      cr('CR-0008', { status: 'rejected' }),
      cr('CR-0009', { origin: 'keel', impact: [{ document: 'docs/spec.md', decision: 'valid' }, { document: 'docs/plan.md', decision: 'later' }] }),
      cr('CR-0010', { origin: 'keel', impact: [{ document: 'docs/spec.md', decision: 'updated' }] }),
    ];
    const label = (id: string) => computeStatus(all.find((c) => c.id === id) as ChangeRequest, all).label;
    expect(label('CR-0004')).toBe('In progress');
    expect(progressLabel(all[1] as ChangeRequest)).toBe('3 of 9 tasks done');
    expect(label('CR-0005')).toBe('Approved · waiting for CR-0003');
    expect(label('CR-0003')).toBe('Approved · ready');
    expect([label('CR-0006'), label('CR-0007'), label('CR-0008')]).toEqual(['Draft', 'Waiting for approval', 'Rejected']);
    expect(label('CR-0009')).toBe('Approved · ready');
    expect(label('CR-0010')).toBe('Applied');
    // A request already in progress comes before one that is only ready.
    expect(nextToApply(all)?.id).toBe('CR-0004');
    expect(nextToApply([all[0] as ChangeRequest, all[2] as ChangeRequest])?.id).toBe('CR-0003');
  });

  it('puts a request after the ones it depends on, and survives a cycle', () => {
    const order = dependencyOrder([cr('CR-0002', { dependsOn: ['CR-0005'] }), cr('CR-0005'), cr('CR-0007', { dependsOn: ['CR-0008'] }), cr('CR-0008', { dependsOn: ['CR-0007'] })]);
    expect(order.map((c) => c.id)).toEqual(['CR-0005', 'CR-0002', 'CR-0008', 'CR-0007']);
  });
});

describe('createChange and setChangeStatus', () => {
  it('raises the next number as a Keel commit, and changes only the status line of a hand-written request', async () => {
    const store = tempStore();
    await initialiseProject(store, { title: 'Demo', author: 'Ada' });
    const made = await createChange(store, { title: 'Export as PDF', reason: 'Finance asked.', affects: ['INT-0001@1'] });
    expect(made).toMatchObject({ ok: true, value: { id: 'CR-0001', status: 'draft', origin: 'keel', affects: ['INT-0001@1'] } });
    const raised = readFileSync(join(store.root, 'changes/CR-0001/CR-0001.md'), 'utf8');
    // Written from the change request template (CR-0013): Why from the reason, the other sections still to write.
    expect(raised).toContain('template: change-request@2');
    expect(raised).toContain('## Why\n\nFinance asked.');
    expect(raised).toContain('## What changes\n\n_Not written yet._');
    expect(await createChange(store, { title: ' ', reason: '' })).toMatchObject({ error: 'invalid-input' });
    // A request written by hand, with its own formatting.
    const hand = '---\nid: CR-0002\ntitle: By hand\nstatus: waiting   \nrequirements: [REQ-001]\n---\n\n# By hand\n\nKeep   this   spacing.\n';
    mkdirSync(join(store.root, 'changes', 'CR-0002'));
    writeFileSync(join(store.root, 'changes/CR-0002/CR-0002.md'), hand);
    const listed = listChanges(store.root).find((c) => c.id === 'CR-0002') as ChangeRequest;
    expect(await setChangeStatus(store, listed, 'approved')).toMatchObject({ ok: true, value: { status: 'approved' } });
    expect(readFileSync(join(store.root, 'changes/CR-0002/CR-0002.md'), 'utf8')).toBe(hand.replace('status: waiting   ', 'status: approved'));
    expect(nextNumber(store.root)).toBe(3);
  });
});
