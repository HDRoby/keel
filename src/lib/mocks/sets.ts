// Mock sets (REQ-010, task R14): the exported screens of a clickable mock made elsewhere, saved in
// docs/mocks/set-<n>/ with a README, and recorded in .keel/mocks.json with the spec version they were made from.
// A set made from an earlier spec version is out of date. A new set replaces the current one; older sets stay.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { chosenOption, readDesign } from '../decisions/design';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/store';
import { readDocument } from '../store/documents';
import { commitBlocker, commitFiles } from '../store/git';
import { readProject } from '../store/workspace';
import { sniffFile, MAX_MOCK_BYTES } from './references';

export const MOCK_SETS_FILE = '.keel/mocks.json';
export const MAX_SET_BYTES = 50 * 1024 * 1024;

const fileSchema = z.object({
  path: z.string(),                         // under docs/mocks/set-<n>/
  source: z.string(),                       // the exported file name
  kind: z.enum(['png', 'html', 'link']),
  number: z.string().optional(),
  screen: z.string().optional(),
  reqs: z.array(z.string()).default([]),
  matched: z.enum(['name', 'user']),
});
const setSchema = z.object({
  set: z.number().int().positive(),
  specVersion: z.number().int().positive(),
  exported: z.string(),
  link: z.string().optional(),
  files: z.array(fileSchema),
  status: z.enum(['current', 'replaced']),
});
const fileOfSets = z.object({ sets: z.array(setSchema).default([]) });

export type MockSetFile = z.infer<typeof fileSchema>;
export type MockSet = z.infer<typeof setSchema>;
export type MockSetError = 'not-found' | 'invalid-input' | 'too-large' | 'unsupported-file' | 'repo-busy';

export function readSets(root: string): MockSet[] {
  const path = join(root, MOCK_SETS_FILE);
  if (!existsSync(path)) return [];
  try {
    const parsed = fileOfSets.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    return parsed.success ? parsed.data.sets : [];
  } catch {
    return [];
  }
}

export const currentSet = (root: string): MockSet | undefined => readSets(root).find((s) => s.status === 'current');

/** The mock status for the gate: no set, a set made from an earlier spec version, or a current one. */
export type MockStatus = 'missing' | 'stale' | 'current';

export function mockStatus(store: Store): MockStatus {
  const set = currentSet(store.root);
  if (!set) return 'missing';
  const spec = readDocument(store, 'docs/spec.md');
  return spec.ok && set.specVersion < spec.value.header.version ? 'stale' : 'current';
}

/** Whether the Form decision has a UI (web, desktop or mobile app), so a clickable mock applies. */
export function formHasUi(root: string): boolean {
  const form = readDesign(root).topics.find((t) => t.id === 'form');
  const chosen = form ? chosenOption(form) : undefined;
  if (!chosen) return false;
  const text = `${chosen.name} ${chosen.summary}`.toLowerCase();
  if (/command-line|command line|\bcli\b|library|terminal program|\bapi only\b|background service/.test(text)) return false;
  return /web|desktop|mobile|\bapp\b|browser|site|electron/.test(text);
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'screen';

/** docs/mocks/README.md: every set, then the current set's screens. */
export function setsReadme(project: string, sets: MockSet[], docs = 'docs'): string {
  const rows = [...sets].sort((a, b) => b.set - a.set).map((s) => {
    const screens = new Set(s.files.filter((f) => f.kind !== 'link').map((f) => f.screen ?? f.source)).size;
    const kinds = [...new Set(s.files.map((f) => f.kind.toUpperCase()))].join(' and ');
    return `| [set-${s.set}](set-${s.set}/) | spec v${s.specVersion} | ${s.exported} | ${screens} screens${kinds ? `, ${kinds}` : ''}${s.link ? `, [live prototype](${s.link})` : ''} | ${s.status === 'current' ? 'Current' : 'Replaced'} |`;
  });
  const current = sets.find((s) => s.status === 'current');
  return [
    '---', `project: ${project}`, '---', '', '# Mock sets', '',
    `Each mock set is the exported screens of a clickable mock, made from one spec version. The current set shows intent; the spec (\`${docs}/spec.md\`) decides. A set made from an earlier spec version is out of date until a new set replaces it. Older sets stay here as history.`, '',
    '| Set | Made from | Exported | Screens | Status |', '| --- | --- | --- | --- | --- |', ...rows, '',
    ...(current ? [
      `## Set ${current.set} (current)`, '', 'Read the HTML sources first, then the PNGs.', '',
      '| File | Screen | Requirements | Source file |', '| --- | --- | --- | --- |',
      ...current.files.map((f) => `| ${f.kind === 'link' ? `[live prototype](${f.source})` : `\`set-${current.set}/${f.path}\``} | ${f.number ? `${f.number} · ` : ''}${f.screen ?? '—'} | ${f.reqs.join(', ') || '—'} | ${f.kind === 'link' ? '—' : `\`${f.source}\``} |`), '',
    ] : []),
  ].join('\n');
}

export interface NewSetFile { name: string; bytes: Uint8Array; number?: string; screen?: string; reqs: string[]; matched: 'name' | 'user' }

/**
 * Saves a new mock set from the files (PNG and HTML, up to 10 MB each) and an optional link to the live prototype,
 * made from the current spec version. The current set becomes replaced. Files, README and record in one commit.
 */
export async function saveMockSet(store: Store, input: { files: NewSetFile[]; link?: string }): Promise<Result<MockSet, MockSetError>> {
  const project = readProject(store.root);
  if (!project.ok) return fail('not-found', project.message);
  const spec = readDocument(store, 'docs/spec.md');
  if (!spec.ok) return fail('not-found', 'There is no spec yet');
  if (input.files.length === 0 && !input.link) return fail('invalid-input', 'Choose the exported files, or paste a link to the prototype');
  if (input.files.some((f) => f.bytes.byteLength > MAX_MOCK_BYTES)) return fail('too-large', 'Files can be up to 10 MB each');
  if (input.files.reduce((n, f) => n + f.bytes.byteLength, 0) > MAX_SET_BYTES) return fail('too-large', 'A mock set can be up to 50 MB');
  let link: string | undefined;
  if (input.link?.trim()) {
    try {
      const url = new URL(input.link.trim());
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return fail('invalid-input', 'Links must start with http:// or https://');
      link = url.toString();
    } catch {
      return fail('invalid-input', 'Not a valid link');
    }
  }
  const checked: { file: NewSetFile; kind: 'png' | 'html' }[] = [];
  for (const file of input.files) {
    const sniffed = sniffFile(file.bytes);
    if (!sniffed || (sniffed.extension !== 'png' && sniffed.kind !== 'html')) return fail('unsupported-file', `${file.name}: only PNG and HTML files go into a mock set`);
    checked.push({ file, kind: sniffed.kind === 'html' ? 'html' : 'png' });
  }
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);

  const docs = project.value.paths.docs;
  const sets = readSets(store.root);
  const number = Math.max(0, ...sets.map((s) => s.set)) + 1;
  const folder = join(docs, 'mocks', `set-${number}`);
  mkdirSync(join(store.root, folder), { recursive: true });
  const used = new Set<string>();
  const files: MockSetFile[] = checked.map(({ file, kind }, i) => {
    let name = `${file.number ? `${file.number}-` : ''}${slug(file.screen ?? file.name.replace(/\.[^.]*$/, ''))}.${kind}`;
    if (used.has(name)) name = name.replace(/(\.[a-z]+)$/, `-${i + 1}$1`);
    used.add(name);
    writeFileSync(join(store.root, folder, name), file.bytes);
    return { path: name, source: file.name, kind, ...(file.number ? { number: file.number } : {}), ...(file.screen ? { screen: file.screen } : {}), reqs: file.reqs, matched: file.matched };
  });
  if (link) files.push({ path: '', source: link, kind: 'link', reqs: [], matched: 'user' });
  const set: MockSet = { set: number, specVersion: spec.value.header.version, exported: (store.now?.() ?? new Date()).toISOString().slice(0, 10), ...(link ? { link } : {}), files, status: 'current' };
  const next = [...sets.map((s) => ({ ...s, status: 'replaced' as const })), set];
  writeFileSync(join(store.root, MOCK_SETS_FILE), `${JSON.stringify({ sets: next }, null, 2)}\n`);
  writeFileSync(join(store.root, docs, 'mocks', 'README.md'), setsReadme(project.value.id, next, docs));
  await commitFiles(store.root, [MOCK_SETS_FILE, join(docs, 'mocks')], `Keel: Mock set ${number} from spec v${set.specVersion}`);
  return ok(set);
}
