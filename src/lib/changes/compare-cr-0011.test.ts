import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Writer } from '../generate/writer';
import { fakeReply } from '../providers/fake';
import { tempStore } from '../store/test-store';
import { compareCr0011 } from './compare-cr-0011';

const fake: Writer = async (_t, messages) => fakeReply('anthropic', messages);

describe('the CR-0011 comparison (CR-0013 Done when)', () => {
  it('generates a request, a prompt, a new task with real file paths and suggested scenarios, close to the hand-written CR-0011', async () => {
    const repo = process.cwd();
    const result = await compareCr0011(tempStore(), repo, fake);
    for (const heading of ['Why', 'What changes', 'Requirement changes', 'Impact by requirement', 'Done when']) expect(result.generated.request).toContain(`## ${heading}`);
    expect(result.generated.prompt).toContain('commit each one as `<task ID>: <task title>`');
    expect(result.generated.tasks.length).toBeGreaterThanOrEqual(1);
    const files = result.generated.tasks.flatMap((t) => t.files);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(existsSync(join(repo, f)), f).toBe(true);
    expect(files.some((f) => result.handWritten.files.includes(f))).toBe(true);
    expect(result.generated.scenarios).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
