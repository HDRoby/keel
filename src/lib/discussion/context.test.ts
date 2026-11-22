import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Writer } from '../generate/writer';
import { createDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject, updateConfig } from '../store/workspace';
import { availableSources, buildContext, checkAttachment, defaultSources, estimateTokens, namedIds } from './context';
import { readDiscussion } from './file';
import { prepareTurn } from './turn';

const INTENT = '# Intent\n\n## Requirements\n\n- REQ-001 Record an expense\n- REQ-002 Export the log\n';

async function project() {
  const store = tempStore('2026-11-22');
  await initialiseProject(store, { title: 'Expenses', author: 'Ada' });
  await createDocument(store, { kind: 'intent', title: 'Expenses', body: INTENT, template: 'standard-intent@3' });
  mkdirSync(join(store.root, 'src'), { recursive: true });
  writeFileSync(join(store.root, 'src', 'export.ts'), 'export const secretSauce = 42;\n');
  mkdirSync(join(store.root, 'tasks'));
  writeFileSync(join(store.root, 'tasks', 'T1.md'), '---\nid: T1\nstatus: done\n---\n# T1 · Record expenses\n\nThe full task text.\n');
  return store;
}

describe('what the assistant can see', () => {
  it('ticks intent, requirements, decisions, plan, open change requests and the code map; standards are off', async () => {
    const store = await project();
    expect(defaultSources(store.root)).toEqual(['intent', 'requirements', 'decisions', 'plan', 'changes', 'codemap']);
    await updateConfig(store, { code_map: 'off' }, 'Keel: code map off');
    expect(availableSources(store.root).map((s) => s.id)).not.toContain('codemap');
  });

  it('sends the code map as names only, and only the ticked sources', async () => {
    const store = await project();
    const blocks = buildContext(store, ['requirements', 'codemap'], '');
    expect(blocks.map((b) => b.label)).toEqual(['Requirements', 'Code map (file names)']);
    expect(blocks[0]?.text).toContain('- REQ-001 Record an expense');
    expect(blocks[1]?.text).toContain('src/export.ts');
    expect(JSON.stringify(blocks)).not.toContain('secretSauce');
    expect(JSON.stringify(blocks)).not.toContain('Record expenses');   // the plan was not ticked
  });

  it('adds sections the conversation names, from ticked sources only', async () => {
    const store = await project();
    expect(namedIds('Does T1 or REQ-002 cover it? See ADR-0007 and CR-0003.')).toEqual(['T1', 'REQ-002', 'ADR-0007', 'CR-0003']);
    expect(buildContext(store, ['plan'], 'What about T1?').find((b) => b.label === 'T1')?.text).toContain('The full task text.');
    expect(buildContext(store, ['requirements'], 'What about T1?').some((b) => b.label === 'T1')).toBe(false);
  });

  it('refuses attachments that may hold keys or look like one', () => {
    expect(checkAttachment('.env', 'A=1')).toMatchObject({ ok: false });
    expect(checkAttachment('notes.md', 'token: 3f2a9c0d1e4b5a6978c0d1e2f3a4b5c6')).toMatchObject({ ok: false });
    expect(checkAttachment('notes.md', 'Reviewers comment.')).toEqual({ ok: true, attachment: { name: 'notes.md', text: 'Reviewers comment.' } });
    expect(estimateTokens('abcdefgh')).toBe(2);
  });
});

describe('a turn', () => {
  it('holds a message that looks like a key before anything is written', async () => {
    const store = await project();
    expect(await prepareTurn(store, { text: 'use sk-test-fixture-0000000000000000', author: 'Ada', sources: [], attachments: [], model: { label: 'Fake', contextLength: 40_960 } }, async () => undefined)).toMatchObject({ ok: false, error: 'key' });
    expect(readDiscussion(store.root, 'DSC-0001')).toBeUndefined();
  });

  it('summarises the oldest messages once the conversation passes 60% of the context', async () => {
    const store = await project();
    let summaries = 0;
    const write: Writer = async (task) => { expect(task).toBe('discussion'); summaries += 1; return 'Ada wants reviewer comments.'; };
    const long = 'reviewers should comment on drafts '.repeat(800);   // about 7,000 tokens each
    let id: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const turn = await prepareTurn(store, { ...(id ? { id } : {}), text: `${i}: ${long}`, author: 'Ada', sources: ['requirements'], attachments: [], model: { label: 'Fake', contextLength: 40_960 } }, write);
      if (!turn.ok) throw new Error(turn.message);
      id = turn.value.discussion.id;
    }
    expect(summaries).toBe(1);
    const d = id ? readDiscussion(store.root, id) : undefined;
    expect(d?.entries.find((e) => e.kind === 'summary')).toMatchObject({ upTo: 1, text: 'Ada wants reviewer comments.' });
  });
});
