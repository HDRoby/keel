// The project folder and its .keel/config.yml (ADR-0009, ADR-0010). One project per folder.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import { writeFileAtomic } from './atomic';
import type { Store } from './store';
import { commitBlocker, commitFiles, initRepo } from './git';
import { ensureSeed } from '../seed';
import { formatReqId } from '../trace/assign';
import { buildTrace } from '../trace/index';
import { maxReqNumber } from '../trace/parse';

export type Env = Record<string, string | undefined>;

/** Folder names for Keel's documents; renamable when the repository already uses them (ADR-0010). */
export interface ProjectPaths {
  docs: string;
  tasks: string;
  features: string;
}

export interface Project {
  id: string;          // e.g. PRJ-0001
  title: string;
  description: string;
  author: string;
  created: string;     // ISO date
  templates: Partial<Record<'intent' | 'spec' | 'plan' | 'task' | 'change' | 'change-prompt' | 'changes-index' | 'readiness-report', string>>;   // chosen per kind, e.g. standard-intent@3
  codeMap: 'off' | 'names' | 'files';   // what planning a change may read (CR-0013)
  changesIndex: 'auto' | 'off';         // keep changes/README.md up to date (CR-0013)
  style?: string;      // brainstorm style, e.g. challenger@1
  discussionStyle: string;              // Discuss a change (CR-0016), e.g. requirements-partner@1
  standards: string[]; // e.g. ['security-baseline@2']
  paths: ProjectPaths;
  commit: 'auto' | 'off';
  mockGate: MockGate; // Clickable mock before the plan (REQ-005, CR-0009)
}

export type MockGate = 'recommended' | 'required' | 'off';

export type ProjectError = 'not-initialised' | 'already-initialised' | 'invalid-config' | 'unknown-standard' | 'seed-failed' | 'repo-busy';

/** Keel's folder inside the project, and its config file (repository paths). */
export const KEEL_DIR = '.keel';
export const CONFIG_FILE = '.keel/config.yml';
export const DEFAULT_PATHS: ProjectPaths = { docs: 'docs', tasks: 'tasks', features: 'features' };
/** The format of .keel/config.yml this Keel writes (CR-0010). A config without `format` is format 1. */
export const CONFIG_FORMAT = 2;

const REF = /^[a-z0-9][a-z0-9-]*@\d+$/;
const FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const configSchema = z.looseObject({
  id: z.string().regex(/^PRJ-\d{4,}$/),
  title: z.string().min(1),
  description: z.string().default(''),
  author: z.string().min(1),
  created: z.preprocess(fromYamlDate, z.string()),
  templates: z.looseObject({
    intent: z.string().regex(REF).optional(), spec: z.string().regex(REF).optional(), plan: z.string().regex(REF).optional(),
    task: z.string().regex(REF).optional(), change: z.string().regex(REF).optional(), 'change-prompt': z.string().regex(REF).optional(), 'changes-index': z.string().regex(REF).optional(), 'readiness-report': z.string().regex(REF).optional(),
  }).default({}),
  style: z.string().regex(REF).optional(),
  discussion_style: z.string().regex(REF).default('requirements-partner@1'),
  standards: z.array(z.string().regex(REF)).default([]),
  paths: z.object({
    docs: z.string().regex(FOLDER).default('docs'),
    tasks: z.string().regex(FOLDER).default('tasks'),
    features: z.string().regex(FOLDER).default('features'),
  }).default(DEFAULT_PATHS),
  commit: z.enum(['auto', 'off']).default('auto'),
  mock_gate: z.enum(['recommended', 'required', 'off']).default('recommended'),
  code_map: z.enum(['off', 'names', 'files']).default('names'),
  changes_index: z.enum(['auto', 'off']).default('auto'),
});

/** gray-matter and js-yaml read unquoted YAML dates as Date; this turns them back into ISO dates. */
export function fromYamlDate(value: unknown): unknown {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

/** Like fromYamlDate, for timestamps: keeps the full ISO time. */
export function fromYamlTime(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

/** A file name from a title: "Expense tracker" → "expense-tracker". Used for the scenario file. */
export function fileNameFor(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
}

/** Today's ISO date from the store's clock. */
export function today(store: Store): string {
  return (store.now?.() ?? new Date()).toISOString().slice(0, 10);
}

/** The folder Keel works on: KEEL_PROJECT_DIR, set by `npx keel [path]`. It must be an existing folder. */
export function projectRoot(env: Env = process.env): string {
  const given = env.KEEL_PROJECT_DIR?.trim();
  if (!given) throw new Error('KEEL_PROJECT_DIR is not set. Start Keel with `npx keel [path]`.');
  const root = isAbsolute(given) ? given : resolve(given);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`KEEL_PROJECT_DIR is not a folder: ${root}`);
  return root;
}

/** The .keel folder of a project. */
export function keelDir(root: string): string {
  return join(root, KEEL_DIR);
}

/** True once Initialise has written .keel/config.yml. */
export function isInitialised(root: string): boolean {
  return existsSync(join(root, CONFIG_FILE));
}

/** The raw config, for updates that keep fields this version does not know (read-back state, handoff files). */
export function readConfig(root: string): Record<string, unknown> | undefined {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) return undefined;
  try {
    const data = yaml.load(readFileSync(file, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Writes config.yml as plain YAML (never a secret: ADR-0011). */
export function writeConfig(root: string, data: Record<string, unknown>): void {
  mkdirSync(keelDir(root), { recursive: true });
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  writeFileAtomic(join(root, CONFIG_FILE), yaml.dump(clean, { lineWidth: 120, noRefs: true, skipInvalid: true }));
}

/** Reads the project from .keel/config.yml. */
export function readProject(root: string): Result<Project, ProjectError> {
  if (!isInitialised(root)) return fail('not-initialised', `${root} has no ${CONFIG_FILE}`);
  const data = readConfig(root);
  if (!data) return fail('invalid-config', `${CONFIG_FILE} is not valid YAML`);
  const parsed = configSchema.safeParse(data);
  if (!parsed.success) return fail('invalid-config', z.prettifyError(parsed.error));
  const { id, title, description, author, created, templates, style, discussion_style: discussionStyle, standards, paths, commit, mock_gate: mockGate, code_map: codeMap, changes_index: changesIndex } = parsed.data;
  const chosen = Object.fromEntries(Object.entries(templates).filter(([k, v]) => typeof v === 'string' && ['intent', 'spec', 'plan', 'task', 'change', 'change-prompt', 'changes-index', 'readiness-report'].includes(k))) as Project['templates'];
  return ok({ id, title, description, author, created, templates: chosen, style, discussionStyle, standards, paths, commit, mockGate, codeMap, changesIndex });
}

export interface InitialiseInput {
  title: string;
  description?: string;
  author: string;
  id?: string;                                     // kept from adopted documents (R9); PRJ-0001 otherwise
  templates?: Project['templates'];
  style?: string;
  standards?: string[];
  extra?: Record<string, unknown>;                 // further config fields, such as next_req
  files?: { path: string; content: string }[];     // written in the same commit, inside .keel/
}

/**
 * Initialise: git init if needed, then .keel/config.yml, .keel/.gitignore and the seed libraries,
 * committed as "Keel: Initialise project". Nothing outside .keel/ is written.
 */
export async function initialiseProject(store: Store, input: InitialiseInput, seed?: string): Promise<Result<Project, ProjectError>> {
  const { root } = store;
  if (isInitialised(root)) return fail('already-initialised', `${root} already has ${CONFIG_FILE}`);
  if ((input.files ?? []).some((f) => !f.path.startsWith(`${KEEL_DIR}/`) || f.path.includes('..'))) {
    return fail('invalid-config', 'Initialise writes only inside .keel/');
  }
  const blocker = await commitBlocker(root);
  if (blocker) return fail('repo-busy', blocker);
  await initRepo(root);
  const problems = ensureSeed(root, seed);
  if (problems.length > 0) return fail('seed-failed', problems.join('; '));
  writeFileAtomic(join(keelDir(root), '.gitignore'), 'cache/\n');
  writeConfig(root, {
    id: input.id ?? 'PRJ-0001',
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    author: input.author.trim(),
    created: today(store),
    templates: input.templates ?? {},
    style: input.style,
    standards: [...new Set(input.standards ?? [])],
    paths: DEFAULT_PATHS,
    commit: 'auto',
    format: CONFIG_FORMAT,
    mock_gate: 'recommended',
    ...input.extra,
  });
  for (const file of input.files ?? []) {
    mkdirSync(join(root, file.path, '..'), { recursive: true });
    writeFileAtomic(join(root, file.path), file.content);
  }
  await commitFiles(root, [KEEL_DIR], 'Keel: Initialise project');
  return readProject(root);
}

/** Changes config.yml fields and commits the file. Unchanged: no commit. */
export async function updateConfig(store: Store, patch: Record<string, unknown>, message: string): Promise<Result<Project, ProjectError>> {
  const data = readConfig(store.root);
  if (!data) return fail('not-initialised', `${store.root} has no ${CONFIG_FILE}`);
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  writeConfig(store.root, { ...data, ...patch });
  const project = readProject(store.root);
  if (!project.ok) {
    writeConfig(store.root, data);
    return project;
  }
  await commitFiles(store.root, [CONFIG_FILE], message);
  return project;
}

/**
 * Reserves the next requirement IDs. The counter (next_req in config.yml) only goes up, and starts past
 * every ID already in the documents or in `alsoUsed`, so an ID is never reused.
 */
export async function reserveRequirementIds(store: Store, count: number, alsoUsed = 0): Promise<Result<string[], ProjectError>> {
  const data = readConfig(store.root);
  if (!data || !isInitialised(store.root)) return fail('not-initialised', `${store.root} has no ${CONFIG_FILE}`);
  if (count <= 0) return ok([]);
  const inDocs = maxReqNumber(Object.keys(buildTrace(store.root).requirements).join(' '));
  const counter = Number.isInteger(data.next_req) ? (data.next_req as number) : 1;
  const first = Math.max(counter, inDocs + 1, alsoUsed + 1);
  const ids = Array.from({ length: count }, (_, i) => formatReqId(first + i));
  const saved = await updateConfig(store, { next_req: first + count }, `Keel: reserve ${ids[0]}${count > 1 ? ` to ${ids.at(-1)}` : ''}`);
  return saved.ok ? ok(ids) : saved;
}

/** Project setup: replaces the project's standards in config.yml. */
export async function setProjectStandards(store: Store, standards: string[]): Promise<Result<Project, ProjectError>> {
  const project = readProject(store.root);
  if (!project.ok) return project;
  const unique = [...new Set(standards)];
  if (unique.join() === project.value.standards.join()) return project;
  return updateConfig(store, { standards: unique }, `Keel: standards ${unique.join(', ') || 'none'}`);
}
