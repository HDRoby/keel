// Handoff into the project folder (REQ-006, task R7). The documents are already in docs/ and tasks/; Handoff
// writes the agent files next to them: AGENTS.md, CLAUDE.md, REVIEW.md, .claude/, the scenarios with failing
// step stubs, docs/traceability.json and CI. Each file is compared with the folder first:
//   New        not in the folder: written.
//   Changed    Keel wrote it before and nobody changed it since: written.
//   Unchanged  the folder already has Keel's content: skipped.
//   Conflict   in the folder, different, and not as Keel left it: kept until the user chooses
//              Keep mine, Use Keel's, or Write as <name>.keel.<ext> next to it.
// Files Keel wrote are tracked with their hash in .keel/config.yml (`handoff.files`).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { githubToken } from '../github/auth';
import { PROVIDER_IDS } from '../providers/types';
import { fail, ok, type Result } from '../result';
import { providerConfig } from '../settings/settings';
import { writeFileAtomic } from '../store/atomic';
import type { Store } from '../store/store';
import { readDocument } from '../store/documents';
import { commitBlocker, commitFiles } from '../store/git';
import { CONFIG_FILE, readConfig, writeConfig } from '../store/workspace';
import { buildHandoff, type HandoffError, type PackageFile } from './scaffold';
import { scanForSecrets } from './secrets-scan';

export type FileState = 'new' | 'changed' | 'unchanged' | 'conflict' | 'kept';
export type ConflictChoice = 'mine' | 'keel' | 'beside';

export interface PlannedFile {
  path: string;
  state: FileState;
  data: Uint8Array;
  optional: boolean;   // setup files (package.json, …): written only when the folder has none
  merged?: boolean;    // an agent file that was here at Initialise: Keel adds its block or pointer, the rest stays (CR-0010)
}

export interface WriteReport {
  written: string[];
  skipped: string[];      // unchanged, kept, or conflicts left as they are
  conflicts: string[];    // still waiting for a choice
  commit: string;         // '' when nothing was written
}

export type WriteError = HandoffError | 'repo-busy';

// What Handoff writes into the folder. Documents stay where they are; mocks stay in .keel/mocks.
const AGENT_FILES = /^(AGENTS\.md|CLAUDE\.md|REVIEW\.md|\.claude\/.+|features\/.+|\.github\/workflows\/ci\.yml|docs\/traceability\.json|docs\/roadmap\.md)$/;
// A minimal setup for a new folder: written only when missing, never over the user's own.
const SETUP_FILES = /^(package\.json|tsconfig\.json|playwright\.config\.ts|\.gitignore|README\.md)$/;

const hashOf = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

const filesSchema = z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/));

/** The files Keel wrote at handoff, with the hash of what it wrote. */
export function writtenByKeel(root: string): Record<string, string> {
  const handoff = readConfig(root)?.handoff;
  const parsed = filesSchema.safeParse(handoff && typeof handoff === 'object' ? (handoff as Record<string, unknown>).files : undefined);
  return parsed.success ? parsed.data : {};
}

/** "AGENTS.md" → "AGENTS.keel.md", ".github/workflows/ci.yml" → ".github/workflows/ci.keel.yml". */
export function besidePath(path: string): string {
  const slash = path.lastIndexOf('/') + 1;
  const name = path.slice(slash);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${path.slice(0, slash)}${name.slice(0, dot)}.keel${name.slice(dot)}` : `${path}.keel`;
}

/** Compares one file with the folder. */
export function stateOf(root: string, file: Pick<PackageFile, 'path' | 'data'>, known: Record<string, string>, optional = false): FileState {
  const full = join(root, file.path);
  if (!existsSync(full)) return 'new';
  const current = readFileSync(full);
  if (Buffer.compare(current, Buffer.from(file.data)) === 0) return 'unchanged';
  if (optional) return 'kept';
  return known[file.path] === hashOf(current) ? 'changed' : 'conflict';
}

export const KEEL_START = '<!-- keel:start -->';
export const KEEL_END = '<!-- keel:end -->';
export const CLAUDE_POINTER = 'Read `AGENTS.md`: the Keel instructions for this project are in it, between the keel:start and keel:end markers.';

/** The user's AGENTS.md with Keel's instructions between the markers; the text outside them is never changed. */
export function mergeKeelBlock(existing: string, keel: string): string {
  const block = `${KEEL_START}\n${keel.trim()}\n${KEEL_END}`;
  const start = existing.indexOf(KEEL_START);
  const end = existing.indexOf(KEEL_END);
  if (start >= 0 && end > start) return `${existing.slice(0, start)}${block}${existing.slice(end + KEEL_END.length)}`;
  return `${existing.replace(/\s*$/, '')}\n\n${block}\n`;
}

/** The user's CLAUDE.md with one pointer line to AGENTS.md, added only when it does not mention AGENTS.md. */
export function withClaudePointer(existing: string): string {
  return existing.includes('AGENTS.md') ? existing : `${existing.replace(/\s*$/, '')}\n\n${CLAUDE_POINTER}\n`;
}

/** Agent files that were in the folder when Keel initialised it (CR-0010, owner decision): merged, never replaced. */
export function agentFilesAtStart(root: string): string[] {
  const value = readConfig(root)?.agent_files_at_start;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** What Handoff would write, with each file's state. */
export async function planHandoff(store: Store): Promise<Result<PlannedFile[], HandoffError>> {
  const built = await buildHandoff(store);
  if (!built.ok) return built;
  const known = writtenByKeel(store.root);
  const atStart = agentFilesAtStart(store.root);
  const decoder = new TextDecoder();
  return ok(built.value
    .filter((f) => AGENT_FILES.test(f.path) || SETUP_FILES.test(f.path))
    .map((f) => {
      const full = join(store.root, f.path);
      if ((f.path === 'AGENTS.md' || f.path === 'CLAUDE.md') && atStart.includes(f.path) && existsSync(full)) {
        const existing = readFileSync(full, 'utf8');
        const merged = f.path === 'AGENTS.md' ? mergeKeelBlock(existing, decoder.decode(f.data)) : withClaudePointer(existing);
        const data = new TextEncoder().encode(merged);
        return { path: f.path, data, optional: false, merged: true, state: merged === existing ? 'unchanged' as const : 'changed' as const };
      }
      const optional = SETUP_FILES.test(f.path);
      return { path: f.path, data: f.data, optional, state: stateOf(store.root, f, known, optional) };
    }));
}

/**
 * Writes New and Changed files, and conflicts the user chose to resolve, then commits them with the
 * updated `handoff.files` as one Keel commit "Keel: Handoff for plan v<N>". Conflicts without a choice
 * are left as they are. Refuses during a merge or rebase (R5) and if a key or token would be written.
 */
export async function writeHandoff(store: Store, choices: Record<string, ConflictChoice> = {}): Promise<Result<WriteReport, WriteError>> {
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  const planned = await planHandoff(store);
  if (!planned.ok) return planned;

  const writes: { path: string; data: Uint8Array }[] = [];
  const skipped: string[] = [];
  const conflicts: string[] = [];
  for (const file of planned.value) {
    if (file.state === 'new' || file.state === 'changed') writes.push(file);
    else if (file.state === 'conflict') {
      const choice = choices[file.path];
      if (choice === 'keel') writes.push(file);
      else if (choice === 'beside') writes.push({ path: besidePath(file.path), data: file.data });
      else {
        skipped.push(file.path);
        if (choice !== 'mine') conflicts.push(file.path);
      }
    } else skipped.push(file.path);
  }

  // Never write a key or token into the folder (Security baseline v2, rule 1).
  const github = githubToken(store);
  const stored = [...PROVIDER_IDS.flatMap((id) => {
    const config = providerConfig(store, id);
    return config.ok && config.value.apiKey ? [config.value.apiKey] : [];
  }), ...(github ? [github] : [])];
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const findings = scanForSecrets(writes.map((f) => ({ path: f.path, text: decoder.decode(f.data) })), stored);
  if (findings.length > 0) {
    return fail('secrets-found', `Nothing was written: ${findings.map((f) => `${f.kind} in ${f.path} line ${f.line}`).join('; ')}`);
  }
  if (writes.length === 0) return ok({ written: [], skipped, conflicts, commit: '' });

  for (const file of writes) {
    const full = join(store.root, file.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileAtomic(full, file.data);
  }
  const config = readConfig(store.root) ?? {};
  const files = { ...writtenByKeel(store.root), ...Object.fromEntries(writes.map((f) => [f.path, hashOf(f.data)])) };
  writeConfig(store.root, { ...config, handoff: { ...(typeof config.handoff === 'object' && config.handoff ? config.handoff : {}), files } });
  const plan = readDocument(store, 'docs/plan.md');
  const commit = await commitFiles(store.root, [...writes.map((f) => f.path), CONFIG_FILE], `Handoff for plan v${plan.ok ? plan.value.header.version : '?'}`);
  return ok({ written: writes.map((f) => f.path), skipped, conflicts, commit });
}
