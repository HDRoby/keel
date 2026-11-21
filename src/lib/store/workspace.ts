// Workspace folder, project folders and project metadata (ADR-0007).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic';
import { homedir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import type { Store } from './db';
import { commitFiles, initRepo } from './git';
import { formatReqId } from '../trace/assign';
import { buildTrace } from '../trace/index';
import { maxReqNumber } from '../trace/parse';

export type Env = Record<string, string | undefined>;

export interface Project {
  slug: string;
  id: string;        // e.g. PRJ-0001
  title: string;
  author: string;
  created: string;   // ISO date
  standards: string[];   // e.g. ['security-baseline@2'], chosen at Start
}

export type ProjectError = 'invalid-slug' | 'already-exists' | 'not-found' | 'invalid-project-file';

/** File at the root of each project repository holding its metadata. */
export const PROJECT_FILE = 'project.md';

/** Allowed project slugs; pages, actions and routes validate against the same pattern. */
export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

const projectSchema = z.object({
  id: z.string().regex(/^PRJ-\d{4,}$/),
  title: z.string().min(1),
  author: z.string().min(1),
  created: z.preprocess(fromYamlDate, z.string()),
  standards: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*@\d+$/)).default([]),
});

/** gray-matter reads unquoted YAML dates as Date; this turns them back into ISO dates. */
export function fromYamlDate(value: unknown): unknown {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

/** Like fromYamlDate, for timestamps: keeps the full ISO time. */
export function fromYamlTime(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

/** Today's ISO date from the store's clock. */
export function today(store: Store): string {
  return (store.now?.() ?? new Date()).toISOString().slice(0, 10);
}

/** Folder where Keel keeps projects and keel.db (ADR-0007). */
export function keelHome(env: Env = process.env): string {
  const fromEnv = env.KEEL_HOME?.trim();
  return fromEnv ? fromEnv : join(homedir(), '.keel');
}

/** Folder of one project's git repository. */
export function projectDir(slug: string, home: string = keelHome()): string {
  if (!SLUG.test(slug)) {
    throw new Error(`Invalid project slug: ${slug}`);
  }
  return join(home, 'projects', slug);
}

/** Slugs of the project folders in the workspace. */
export function listProjectSlugs(home: string): string[] {
  const root = join(home, 'projects');
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && SLUG.test(e.name))
    .map((e) => e.name)
    .sort();
}

/** Creates a project: a git repository with project.md as its first commit. */
export async function createProject(
  store: Store,
  input: { slug: string; title: string; author: string; standards?: string[] },
): Promise<Result<Project, ProjectError>> {
  if (!SLUG.test(input.slug)) return fail('invalid-slug', `Invalid project slug: ${input.slug}`);
  const dir = projectDir(input.slug, store.home);
  if (existsSync(join(dir, PROJECT_FILE))) return fail('already-exists', `Project ${input.slug} already exists`);
  const number = listProjectSlugs(store.home).length + 1;
  const project: Project = {
    slug: input.slug,
    id: `PRJ-${String(number).padStart(4, '0')}`,
    title: input.title,
    author: input.author,
    standards: input.standards ?? [],
    created: today(store),
  };
  await initRepo(dir);
  const header = { id: project.id, title: project.title, author: project.author, created: project.created, standards: project.standards };
  writeFileAtomic(join(dir, PROJECT_FILE), matter.stringify(`\n# ${project.title}\n`, header));
  await commitFiles(dir, [PROJECT_FILE], `${project.id}: Create project`);
  store.index.upsertProject(project);
  return ok(project);
}

/** Reads a project's metadata from its project.md. */
export function readProject(slug: string, home: string): Result<Project, ProjectError> {
  if (!SLUG.test(slug)) return fail('invalid-slug', `Invalid project slug: ${slug}`);
  const file = join(projectDir(slug, home), PROJECT_FILE);
  if (!existsSync(file)) return fail('not-found', `Project ${slug} does not exist`);
  const parsed = projectSchema.safeParse(matter(readFileSync(file, 'utf8'), {}).data);
  if (!parsed.success) return fail('invalid-project-file', z.prettifyError(parsed.error));
  return ok({ slug, ...parsed.data });
}

/**
 * Reserves the next requirement IDs for a project. The counter (next_req in project.md) only goes up,
 * and starts past every ID already in the documents or in `alsoUsed`, so an ID is never reused.
 */
export async function reserveRequirementIds(store: Store, slug: string, count: number, alsoUsed = 0): Promise<Result<string[], ProjectError>> {
  const project = readProject(slug, store.home);
  if (!project.ok) return project;
  if (count <= 0) return ok([]);
  const dir = projectDir(slug, store.home);
  const file = join(dir, PROJECT_FILE);
  const parsed = matter(readFileSync(file, 'utf8'), {});
  const inDocs = maxReqNumber(Object.keys(buildTrace(dir).requirements).join(' '));
  const counter = Number.isInteger(parsed.data.next_req) ? (parsed.data.next_req as number) : 1;
  const first = Math.max(counter, inDocs + 1, alsoUsed + 1);
  const ids = Array.from({ length: count }, (_, i) => formatReqId(first + i));
  writeFileAtomic(file, matter.stringify(parsed.content, { ...parsed.data, next_req: first + count }));
  await commitFiles(dir, [PROJECT_FILE], `${project.value.id}: reserve ${ids[0]}${count > 1 ? ` to ${ids.at(-1)}` : ''}`);
  return ok(ids);
}

/** Project setup: replaces the project's standards in project.md. */
export async function setProjectStandards(store: Store, slug: string, standards: string[]): Promise<Result<Project, ProjectError>> {
  const project = readProject(slug, store.home);
  if (!project.ok) return project;
  const unique = [...new Set(standards)];
  if (unique.join() === project.value.standards.join()) return project;
  const dir = projectDir(slug, store.home);
  const file = join(dir, PROJECT_FILE);
  const parsed = matter(readFileSync(file, 'utf8'), {});
  writeFileAtomic(file, matter.stringify(parsed.content, { ...parsed.data, standards: unique }));
  await commitFiles(dir, [PROJECT_FILE], `${project.value.id}: standards ${unique.join(', ') || 'none'}`);
  return readProject(slug, store.home);
}
