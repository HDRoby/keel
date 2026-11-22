import { describe, expect, it } from 'vitest';
import { fakeReply } from '../providers/fake';
import { createDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import type { Discussion } from './file';
import { checkProposal, extractProposal, parseProposal, proposalState } from './proposal';
import { DISCUSS_MARKER } from './prompt';

const SYSTEM = `${DISCUSS_MARKER}\n\n## Requirements\n\n- REQ-005 Each stage unlocks only when the previous one is approved\n`;
const reply = (last: string, control = {}) => fakeReply('ollama', [{ role: 'system', content: SYSTEM }, { role: 'user', content: last }], control);
const discussion = (texts: [string, string][]): Discussion => ({
  id: 'DSC-0001', title: 't', status: 'open', model: '', style: '', started: '', sources: [], attachments: [], path: '',
  entries: texts.map(([author, text]) => ({ kind: 'message', author, at: '2026-11-22 10:00', text })),
});

describe('the proposal block', () => {
  it('is taken from the last keel-proposal block, validated, and new items carry no ID', () => {
    const { block, rest } = extractProposal(reply('Reviewers should comment'));
    expect(rest).toBe('A small change: comments on the draft spec, resolved before approval.');
    const parsed = block ? parseProposal(block) : undefined;
    expect(parsed?.ok && parsed.proposal.requirements.map((r) => [r.id, r.change])).toEqual([['new', 'new'], ['REQ-005', 'changed']]);
  });

  it('rejects a block that is not valid', () => {
    const { block } = extractProposal(reply('Reviewers', { discussion: 'invalid' }));
    expect(block && parseProposal(block)).toMatchObject({ ok: false });
    expect(parseProposal('{"title": "x"}')).toMatchObject({ ok: false });
  });

  it('knows when a proposal waits, and when the last reply could not be read', () => {
    expect(proposalState(discussion([['Ada', 'Hi'], ['Assistant', reply('Hi')]]))).toMatchObject({ kind: 'waiting', from: 1 });
    expect(proposalState(discussion([['Ada', 'Hi'], ['Assistant', reply('Hi', { discussion: 'invalid' })]]))).toEqual({ kind: 'unreadable' });
    expect(proposalState(discussion([['Ada', 'Hi'], ['Assistant', 'A question?']]))).toEqual({ kind: 'none' });
    expect(proposalState(discussion([['Ada', 'Hi'], ['Assistant', reply('Hi')], ['Ada', 'yes'], ['Assistant', reply('yes')]]))).toMatchObject({ kind: 'waiting', from: 1 });
  });
});

describe('checks', () => {
  async function project() {
    const store = tempStore('2026-11-22');
    await initialiseProject(store, { title: 'Keel', author: 'Ada' });
    await createDocument(store, { kind: 'intent', title: 'Keel', body: '# Intent\n\n## Requirements\n\n- REQ-005 Each stage unlocks only when the previous one is approved\n\n## Constraints\n\n- Single user first, no accounts\n', template: 'standard-intent@3' });
    return store;
  }

  it('passes a proposal with known IDs and new files', async () => {
    const store = await project();
    const { block } = extractProposal(reply('Reviewers'));
    const parsed = block ? parseProposal(block) : undefined;
    if (!parsed?.ok) throw new Error('no proposal');
    const checks = checkProposal(store, parsed.proposal);
    expect(checks.filter((c) => c.kind === 'error')).toEqual([]);
    expect(checks.map((c) => c.text)).toEqual(expect.arrayContaining(['The requirement IDs exist', 'The files are in the code map or marked new']));
  });

  it('flags unknown requirements, files outside the code map and intent constraints', async () => {
    const store = await project();
    const { block } = extractProposal(reply('Reviewers', { discussion: 'unknown-req' }));
    const parsed = block ? parseProposal(block) : undefined;
    if (!parsed?.ok) throw new Error('no proposal');
    const p = { ...parsed.proposal, tasks: [{ title: 'x', files: ['src/nowhere.ts'] }], what: ['Comments need user accounts for every single reviewer'] };
    const checks = checkProposal(store, p);
    expect(checks).toEqual(expect.arrayContaining([
      { kind: 'error', text: 'Unknown requirement REQ-099' },
      { kind: 'warn', text: 'Not in the code map and not marked new: src/nowhere.ts' },
      { kind: 'warn', text: 'Intent constraint: Single user first, no accounts' },
    ]));
  });
});
