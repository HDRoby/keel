import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapAgentFiles } from './mapping';
import { localReader, readinessScan } from './rules';

const FIXTURES = join(process.cwd(), 'features', 'fixtures', 'folders');
const map = (name: string) => {
  const scan = readinessScan(join(FIXTURES, name));
  return mapAgentFiles(scan, localReader(scan.root));
};

describe('your AI files and the Keel standard', () => {
  it('keeps AGENTS.md and points the other instruction files to it', () => {
    expect(map('existing-ai').map((r) => [r.file, r.keel, r.proposal])).toEqual([
      ['AGENTS.md', 'AGENTS.md', 'Keep'],
      ['CLAUDE.md', 'Points to AGENTS.md', 'Point to'],
      ['.github/copilot-instructions.md', 'Points to AGENTS.md', 'Point to'],
    ]);
  });

  it('is empty for folders without AI files', () => {
    expect(map('existing')).toEqual([]);
    expect(map('new')).toEqual([]);
  });

  it('maps Keel\'s own repository: AGENTS.md kept, CLAUDE.md already pointing, subagents and skills kept', () => {
    const scan = { ...readinessScan(process.cwd()), kase: 'keel' as const };
    expect(mapAgentFiles(scan, localReader(scan.root)).map((r) => [r.file, r.proposal])).toEqual([
      ['AGENTS.md', 'Keep'], ['CLAUDE.md', 'Keep'], ['.claude/agents/', 'Keep'], ['.claude/skills/', 'Keep'],
    ]);
  });
});
