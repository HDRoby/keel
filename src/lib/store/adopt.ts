// Adopting Keel documents already in a folder, and importing Keel v0.1 projects (REQ-012, task R9).
// Adopt: Initialise reads the project id, title, author, templates, style and standards from the documents'
// Keel headers and keeps the documents as they are. Import: copies a v0.1 project from ~/.keel/projects/<slug>
// into a folder and commits it. Neither ever changes the documents' content or the old folder.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { EXPLORE_FILE, exploreFromIntent, LEGACY_FILE } from '../brainstorm/session';
import { fail, ok, type Result } from '../result';
import { previewRoot } from '../seed';
import { parseTemplateRef, readTemplate, templateIdentity } from '../templates/library';
import { maxReqNumber } from '../trace/parse';
import { buildTrace } from '../trace/index';
import { writeFileAtomic } from './atomic';
import type { Store } from './db';
import { parseDocument } from './documents';
import { commitBlocker, commitFiles, initRepo } from './git';
import { rebuildIndex } from './reindex';
import { CONFIG_FILE, DEFAULT_PATHS, fromYamlDate, initialiseProject, isInitialised, KEEL_DIR, readProject, today, writeConfig, type Project, type ProjectError } from './workspace';

const DOCUMENTS = ['docs/intent.md', 'docs/spec.md', 'docs/plan.md'];
const DEFAULT_INTENT = 'standard-intent@3';
const DEFAULT_STYLE = 'challenger@1';

export interface FoundDocuments {
  id: string;               // project id from the headers, e.g. PRJ-0042
  title: string;
  author: string;
  documents: { path: string; id: string; version: number; status: string }[];
  templates: Project['templates'];
  style?: string;
  standards: string[];
  maxReq: number;           // highest REQ number in the documents, tasks and scenarios
}

/** Keel documents already in the folder (intent, spec or plan with a Keel header), if any. */
export function findKeelDocuments(root: string): FoundDocuments | undefined {
  const headers = DOCUMENTS.flatMap((path) => {
    const file = join(root, path);
    if (!existsSync(file)) return [];
    const parsed = parseDocument(readFileSync(file, 'utf8'));
    return parsed.ok ? [{ path, header: parsed.value.header }] : [];
  });
  const first = headers[0];
  if (!first) return undefined;
  const of = (path: string) => headers.find((h) => h.path === path)?.header;
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const spec = of('docs/spec.md');
  const standards = z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*@\d+$/)).safeParse(spec?.standards);
  const kind = (path: string, want: string) => {
    const ref = text(of(path)?.template);
    return ref && readTemplateKind(ref) === want ? ref : undefined;
  };
  return {
    id: first.header.project,
    title: of('docs/intent.md')?.title ?? first.header.title,
    author: first.header.author,
    documents: headers.map(({ path, header }) => ({ path, id: header.id, version: header.version, status: header.status })),
    templates: Object.fromEntries(Object.entries({ intent: kind('docs/intent.md', 'intent'), spec: kind('docs/spec.md', 'spec'), plan: kind('docs/plan.md', 'plan') }).filter(([, v]) => v)),
    style: text(of('docs/intent.md')?.brainstorm_style),
    standards: standards.success ? standards.data : [],
    maxReq: maxReqNumber(Object.keys(buildTrace(root).requirements).join(' ')),
  };
}

/** The kind of a template in the seed library, so an unknown template is not written into the config. */
function readTemplateKind(ref: string): string | undefined {
  const parsed = parseTemplateRef(ref);
  const template = parsed && readTemplate(previewRoot(), parsed.id, parsed.version);
  return template?.ok ? template.value.kind : undefined;
}

/**
 * Initialise by adopting the Keel documents in the folder: config.yml gets their project id, title, templates,
 * style and standards; the next requirement number starts after the highest REQ ID found. The documents are
 * not touched. A brainstorm is made from the intent's sections so Explore and Project setup work.
 */
export async function adoptProject(store: Store, author?: string): Promise<Result<Project, ProjectError>> {
  if (isInitialised(store.root)) return fail('already-initialised', 'This folder is already initialised');
  const found = findKeelDocuments(store.root);
  if (!found) return fail('not-initialised', 'No Keel documents found in docs/');
  const library = previewRoot();
  const intentTemplate = found.templates.intent ?? DEFAULT_INTENT;
  const style = found.style && existsSync(join(library, '.keel', 'styles', `${found.style}.md`)) ? found.style : DEFAULT_STYLE;
  const ref = parseTemplateRef(intentTemplate);
  const template = ref ? readTemplate(library, ref.id, ref.version) : undefined;
  const intent = existsSync(join(store.root, 'docs/intent.md')) ? parseDocument(readFileSync(join(store.root, 'docs/intent.md'), 'utf8')) : undefined;
  const files = template?.ok && intent?.ok
    ? [{ path: EXPLORE_FILE, content: `${JSON.stringify(exploreFromIntent({ title: found.title, idea: '', template: intentTemplate, style, intentBody: intent.value.body, templateContent: template.value.content }), null, 2)}\n` }]
    : [];
  const made = await initialiseProject(store, {
    id: found.id, title: found.title, author: author?.trim() || found.author,
    templates: { ...found.templates, intent: intentTemplate }, style, standards: found.standards,
    extra: { next_req: found.maxReq + 1 }, files,
  });
  if (made.ok) await rebuildIndex(store);
  return made;
}

const legacyProject = z.looseObject({
  id: z.string().regex(/^PRJ-\d{4,}$/),
  title: z.string().min(1),
  author: z.string().min(1),
  created: z.preprocess(fromYamlDate, z.string()),
  standards: z.array(z.string()).default([]),
  next_req: z.number().int().optional(),
  handoff: z.record(z.string(), z.string()).optional(),   // the handoff commands in v0.1
});

export interface ImportReport {
  project: Project;
  copied: string[];   // repository paths in the folder
  commit: string;
}

export type ImportError = 'not-found' | 'invalid-project' | 'already-initialised' | 'repo-busy' | 'conflict';

/**
 * Copies a Keel v0.1 project (`~/.keel/projects/<slug>`) into a folder: docs/, tasks/ and features/, the
 * brainstorm and mock files, and config.yml from project.md. The libraries come from the old workspace
 * (`legacyHome`) when it has them, else from the seed. Commits "Keel: Import <slug>". The old folder is only read.
 */
export async function importProject(source: string, store: Store, legacyHome?: string): Promise<Result<ImportReport, ImportError>> {
  const projectFile = join(source, 'project.md');
  if (!existsSync(projectFile)) return fail('not-found', `${source} is not a Keel v0.1 project (no project.md)`);
  const meta = legacyProject.safeParse(matter(readFileSync(projectFile, 'utf8'), {}).data);
  if (!meta.success) return fail('invalid-project', z.prettifyError(meta.error));
  const { root } = store;
  if (isInitialised(root)) return fail('already-initialised', `${root} already has ${CONFIG_FILE}`);
  mkdirSync(root, { recursive: true });
  const blocker = await commitBlocker(root);
  if (blocker) return fail('repo-busy', blocker);
  const clash = ['docs', 'tasks', 'features'].filter((d) => existsSync(join(root, d)) && readdirSync(join(root, d)).length > 0);
  if (clash.length > 0) return fail('conflict', `The folder already has ${clash.join(', ')}; import into a folder without them`);
  await initRepo(root);

  const copied: string[] = [];
  for (const folder of ['docs', 'tasks', 'features']) {
    if (!existsSync(join(source, folder))) continue;
    cpSync(join(source, folder), join(root, folder), { recursive: true, filter: (from) => !from.endsWith(join('docs', 'mocks')) });
    copied.push(folder);
  }
  mkdirSync(join(root, KEEL_DIR), { recursive: true });
  if (existsSync(join(source, 'brainstorm.md'))) {
    mkdirSync(join(root, '.keel', 'brainstorm'), { recursive: true });
    // Kept in CR-0004's form; Explore converts it the first time it opens (owner decision 2, CR-0005).
    copyFileSync(join(source, 'brainstorm.md'), join(root, LEGACY_FILE));
  }
  const mocks = join(source, 'docs', 'mocks');
  if (existsSync(mocks)) {
    mkdirSync(join(root, '.keel', 'mocks'), { recursive: true });
    for (const name of readdirSync(mocks)) copyFileSync(join(mocks, name), join(root, '.keel', 'mocks', name === 'README.md' ? 'references.md' : name));
  }
  copyLibraries(legacyHome, root);

  const intent = existsSync(join(root, 'docs/intent.md')) ? parseDocument(readFileSync(join(root, 'docs/intent.md'), 'utf8')) : undefined;
  const brainstorm = existsSync(join(root, LEGACY_FILE)) ? matter(readFileSync(join(root, LEGACY_FILE), 'utf8'), {}).data : {};
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const { id, title, author, created, standards, next_req: nextReq, handoff } = meta.data;
  writeConfig(root, {
    id, title, description: text(brainstorm.idea) ?? '', author, created: created || today(store),
    templates: Object.fromEntries(Object.entries({ intent: text(brainstorm.template) ?? text(intent?.ok ? intent.value.header.template : undefined) }).filter(([, v]) => v)),
    style: text(brainstorm.brainstorm_style),
    standards, paths: DEFAULT_PATHS, commit: 'auto',
    ...(nextReq ? { next_req: nextReq } : {}),
    ...(handoff ? { commands: handoff } : {}),
  });
  writeFileAtomic(join(root, KEEL_DIR, '.gitignore'), 'cache/\n');
  const project = readProject(root);
  if (!project.ok) return fail('invalid-project', project.message);
  const commit = await commitFiles(root, [...copied, KEEL_DIR], `Import ${basename(source)}`);
  await rebuildIndex(store);
  return ok({ project: project.value, copied: [...copied, KEEL_DIR], commit });
}

/** Templates, agent kit, styles and standards from the old workspace, else from the seed. */
function copyLibraries(legacyHome: string | undefined, root: string): void {
  const seed = previewRoot();
  const old = (sub: string) => (legacyHome && existsSync(join(legacyHome, sub)) ? join(legacyHome, sub) : undefined);
  const templates = old('templates');
  if (templates) {
    for (const name of readdirSync(templates).filter((n) => n.endsWith('.md'))) {
      const identity = templateIdentity(readFileSync(join(templates, name), 'utf8'));
      if (!identity.ok) continue;
      const folder = join(root, '.keel', identity.value.kind === 'agent-kit' ? 'agent-kit' : 'templates');
      mkdirSync(folder, { recursive: true });
      copyFileSync(join(templates, name), join(folder, name));
    }
  } else {
    cpSync(join(seed, '.keel', 'templates'), join(root, '.keel', 'templates'), { recursive: true });
    cpSync(join(seed, '.keel', 'agent-kit'), join(root, '.keel', 'agent-kit'), { recursive: true });
  }
  for (const kind of ['styles', 'standards']) {
    cpSync(old(kind) ?? join(seed, '.keel', kind), join(root, '.keel', kind), { recursive: true });
  }
}
