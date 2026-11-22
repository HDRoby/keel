import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Writer } from '../generate/writer';
import { readableFiles, reviewArea, reviewAreas, tickedTexts } from './review';
import { AREAS, readinessScan, runRules } from './rules';

const FIXTURES = join(process.cwd(), 'features', 'fixtures', 'folders');
function existingAi() {
  const root = mkdtempSync(join(tmpdir(), 'keel-review-'));
  cpSync(join(FIXTURES, 'existing-ai'), root, { recursive: true });
  return readinessScan(root);
}
const ANSWER = JSON.stringify({ why: [{ rule: 'AI-02', text: 'Two files disagree.' }], findings: [], advice: [] });

describe('the model review', () => {
  it('offers the AI files, ticks the instruction files, and never lets a file that may hold keys be ticked', () => {
    const files = readableFiles(existingAi());
    expect(files.map((f) => [f.path, f.ticked, f.blocked])).toEqual([
      ['.cursor/mcp.json', false, true], ['.github/copilot-instructions.md', true, false], ['AGENTS.md', true, false], ['CLAUDE.md', true, false],
    ]);
  });

  it('sends names, the rule results and only the ticked files, and only for the AI-file areas', async () => {
    const scan = existingAi();
    const sent: { area: string; user: string }[] = [];
    const write: Writer = async (task, messages) => {
      expect(task).toBe('feasibility');
      sent.push({ area: /for one area: ([^.]+)\./.exec(messages[0]?.content ?? '')?.[1] ?? '', user: messages.at(-1)?.content ?? '' });
      return ANSWER;
    };
    const files = tickedTexts(scan, ['AGENTS.md', '.cursor/mcp.json', 'src/index.ts']);
    expect(files.map((f) => f.path)).toEqual(['AGENTS.md']);
    const review = await reviewAreas(write, scan, runRules(scan), files);
    expect(review.error).toBeUndefined();
    expect(Object.keys(review.answers)).toEqual([...AREAS]);
    expect(sent.map((s) => s.area)).toEqual([...AREAS]);
    for (const s of sent) {
      const input = JSON.parse(s.user) as { names: string[]; files: { path: string }[] };
      expect(input.names).toContain('src/index.ts');
      expect(input.files.map((f) => f.path)).toEqual(['Agent instructions', 'Conventions', 'Agent tooling'].includes(s.area) ? ['AGENTS.md'] : []);
      expect(s.user).not.toContain('fixture-not-a-key');
      expect(s.user).not.toContain('Keep pull requests small');   // CLAUDE.md was not ticked
    }
  });

  it('retries an invalid answer once, then gives up with a reason', async () => {
    let calls = 0;
    const flaky: Writer = async () => (calls++ === 0 ? 'not json' : ANSWER);
    expect(await reviewArea(flaky, 'Safety', {})).toMatchObject({ ok: true });
    expect(calls).toBe(2);
    expect(await reviewArea(async () => 'still not json', 'Safety', {})).toEqual({ ok: false, reason: 'the model\'s answer was not in the expected format, twice' });
    expect(await reviewArea(async () => undefined, 'Safety', {})).toMatchObject({ ok: false, reason: expect.stringContaining('did not answer') });
    expect(await reviewArea(() => new Promise(() => undefined), 'Safety', {}, 20)).toEqual({ ok: false, reason: 'no answer within 0 s' });
  });

  it('stops at the first area that fails and keeps the ones already reviewed', async () => {
    const scan = existingAi();
    let calls = 0;
    const review = await reviewAreas(async () => (calls++ < 2 ? ANSWER : undefined), scan, runRules(scan), []);
    expect(Object.keys(review.answers)).toEqual(['Agent instructions', 'Project knowledge']);
    expect(review.error).toContain('did not answer');
  });
});
