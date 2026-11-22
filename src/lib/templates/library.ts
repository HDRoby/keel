// Template library in .keel/templates and .keel/agent-kit: seeded at Initialise, edited as new versions,
// removal blocked while a document in this folder uses it (REQ-003, ADR-0010).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { fail, ok, type Result } from '../result';
import { listDocumentPaths, parseDocument } from '../store/documents';

export type TemplateGroup = 'intent' | 'spec' | 'plan' | 'roadmap' | 'decision' | 'agent-instructions' | 'agent-kit';

export const GROUPS: { group: TemplateGroup; label: string }[] = [
  { group: 'intent', label: 'Intent' },
  { group: 'spec', label: 'Spec' },
  { group: 'plan', label: 'Plan' },
  { group: 'roadmap', label: 'Roadmap' },
  { group: 'decision', label: 'Decision records' },
  { group: 'agent-instructions', label: 'Agent instructions' },
  { group: 'agent-kit', label: 'Agent kit' },
];

// Seed kinds that share a group: tasks belong to the plan, change requests to decisions.
const GROUP_OF: Record<string, TemplateGroup> = { task: 'plan', change: 'decision' };

export interface TemplateSummary {
  id: string;          // e.g. standard-intent
  name: string;        // e.g. Standard intent v3
  kind: string;
  group: TemplateGroup;
  latest: number;
  versions: number[];
}

export interface TemplateVersion {
  id: string;
  version: number;
  kind: string;
  content: string;     // the whole file, front matter included
}

/** A document in this folder made from a template: "<path> (<id>@<version>)". */
export type TemplateUse = string;

export type TemplateError = 'invalid-template' | 'not-found' | 'in-use' | 'kind-changed';

/** Allowed template ids; the form actions validate against the same pattern. */
export const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** A versioned reference such as "standard-intent@3" or "challenger@1". */
export const VERSIONED_REF = /^([a-z0-9][a-z0-9-]*)@(\d+)$/;

/** Splits "standard-intent@3" into id and version. */
export function parseTemplateRef(ref: string): { id: string; version: number } | undefined {
  const match = VERSIONED_REF.exec(ref);
  return match ? { id: match[1] ?? '', version: Number(match[2]) } : undefined;
}

/** Display name, for example "Standard intent v3". */
export function templateName(id: string, version: number): string {
  const words = id.replace(/-/g, ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} v${version}`;
}

/** Reads id, version and kind from a template file. Agent-kit files use name and template_version. */
export function templateIdentity(content: string): Result<{ id: string; version: number; kind: string }, 'invalid-template'> {
  let data: Record<string, unknown>;
  try {
    data = matter(content, {}).data;
  } catch {
    return fail('invalid-template', 'Front matter is not valid YAML');
  }
  const ref = typeof data.template === 'string' ? parseTemplateRef(data.template) : undefined;
  if (ref && typeof data.kind === 'string') return ok({ ...ref, kind: data.kind });
  if (typeof data.name === 'string' && TEMPLATE_ID.test(data.name) && Number.isInteger(data.template_version)) {
    return ok({ id: data.name, version: data.template_version as number, kind: 'agent-kit' });
  }
  return fail('invalid-template', 'A template needs "template: <id>@<version>" and "kind", or an agent-kit "name" and "template_version"');
}

/** Agent-kit files live in .keel/agent-kit; every other template in .keel/templates. */
function libraryDir(root: string, kind = 'template'): string {
  return join(root, '.keel', kind === 'agent-kit' ? 'agent-kit' : 'templates');
}

const fileOf = (root: string, kind: string, id: string, version: number) => join(libraryDir(root, kind), `${id}@${version}.md`);

/** Copies the seed templates and agent kit into the project's .keel/ at Initialise. */
export function ensureLibrary(root: string, seedDir: string): Result<number, 'invalid-template'> {
  if (existsSync(libraryDir(root))) return ok(0);
  const sources = ['templates', 'agent-kit']
    .map((sub) => join(seedDir, sub))
    .filter((sub) => existsSync(sub))
    .flatMap((sub) => readdirSync(sub).filter((f) => f.endsWith('.md')).map((f) => join(sub, f)));
  const staged: { from: string; to: string }[] = [];
  for (const from of sources) {
    const identity = templateIdentity(readFileSync(from, 'utf8'));
    if (!identity.ok) return fail('invalid-template', `${from}: ${identity.message}`);
    staged.push({ from, to: fileOf(root, identity.value.kind, identity.value.id, identity.value.version) });
  }
  [libraryDir(root), libraryDir(root, 'agent-kit')].forEach((d) => mkdirSync(d, { recursive: true }));
  staged.forEach(({ from, to }) => copyFileSync(from, to));
  return ok(staged.length);
}

/** Every template with its versions, sorted by group then id. */
export function listTemplates(root: string): TemplateSummary[] {
  const byId = new Map<string, TemplateSummary>();
  const files = [libraryDir(root), libraryDir(root, 'agent-kit')]
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => readdirSync(dir).sort().map((file) => ({ dir, file })));
  for (const { dir, file } of files) {
    if (!file.endsWith('.md') || !VERSIONED_REF.test(file.slice(0, -3))) continue;
    const identity = templateIdentity(readFileSync(join(dir, file), 'utf8'));
    if (!identity.ok || (identity.value.kind === 'agent-kit') !== dir.endsWith('agent-kit')) continue;
    const { id, version, kind } = identity.value;
    const entry = byId.get(id) ?? { id, name: '', kind, group: groupOf(kind), latest: 0, versions: [] };
    entry.versions.push(version);
    if (version > entry.latest) Object.assign(entry, { latest: version, kind, group: groupOf(kind), name: templateName(id, version) });
    byId.set(id, entry);
  }
  const order = GROUPS.map((g) => g.group);
  return [...byId.values()]
    .map((t) => ({ ...t, versions: t.versions.sort((a, b) => a - b) }))
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.id.localeCompare(b.id));
}

/** The templates of a group as choices: every version, or only the latest of each. */
export function templateOptions(root: string, group: TemplateGroup, versions: 'all' | 'latest'): { ref: string; name: string }[] {
  return listTemplates(root)
    .filter((t) => t.group === group)
    .flatMap((t) => (versions === 'all' ? t.versions : [t.latest]).map((v) => ({ ref: `${t.id}@${v}`, name: templateName(t.id, v) })));
}

/** One version of a template; the latest when no version is given. */
export function readTemplate(root: string, id: string, version?: number): Result<TemplateVersion, TemplateError> {
  if (!TEMPLATE_ID.test(id)) return fail('not-found', `No template ${id}`);
  const summary = listTemplates(root).find((t) => t.id === id);
  if (!summary || !summary.versions.includes(version ?? summary.latest)) {
    return fail('not-found', `No template ${id}${version ? `@${version}` : ''}`);
  }
  const wanted = version ?? summary.latest;
  const content = readFileSync(fileOf(root, summary.kind, id, wanted), 'utf8');
  return ok({ id, version: wanted, kind: summary.kind, content });
}

/** Saves edited content as the next version of a template. Earlier versions stay as they were. */
export function saveTemplateVersion(root: string, id: string, content: string): Result<TemplateVersion, TemplateError> {
  const current = readTemplate(root, id);
  if (!current.ok) return current;
  const identity = templateIdentity(content);
  if (!identity.ok) return identity;
  if (identity.value.kind !== current.value.kind) {
    return fail('kind-changed', `The kind must stay "${current.value.kind}"`);
  }
  const version = current.value.version + 1;
  const parsed = matter(content, {});
  const data = current.value.kind === 'agent-kit' && parsed.data.template === undefined
    ? { ...parsed.data, name: id, template_version: version }
    : { ...parsed.data, template: `${id}@${version}` };
  const next = matter.stringify(parsed.content, data);
  writeFileSync(fileOf(root, current.value.kind, id, version), next);
  return ok({ id, version, kind: current.value.kind, content: next });
}

/** Repository path of the brainstorm transcript; brainstorm/session.ts uses the same path. */
const BRAINSTORM = '.keel/brainstorm/explore.md';

/** Documents in this folder made from any version of a template. */
export function templateUsage(root: string, id: string, version?: number): TemplateUse[] {
  const matches = (ref: unknown) => {
    const parsed = typeof ref === 'string' ? parseTemplateRef(ref) : undefined;
    return parsed?.id === id && (version === undefined || parsed.version === version);
  };
  const refs: { path: string; template: unknown }[] = listDocumentPaths(root).map((path) => {
    const doc = parseDocument(readFileSync(join(root, path), 'utf8'));
    return { path, template: doc.ok ? doc.value.header.template : undefined };
  });
  // A brainstorm in progress uses its intent template before intent.md exists.
  refs.push({ path: BRAINSTORM, template: brainstormTemplate(root) });
  return refs.filter((r) => matches(r.template)).map((r) => `${r.path} (${r.template as string})`);
}

function brainstormTemplate(root: string): unknown {
  try {
    return matter(readFileSync(join(root, BRAINSTORM), 'utf8'), {}).data.template;
  } catch {
    return undefined;   // no brainstorm yet, or its front matter is not valid YAML
  }
}

function usedBy(uses: TemplateUse[]): string {
  return uses.join(', ');
}

/** Removes every version of a template, unless a document in this folder uses it. */
export function removeTemplate(root: string, id: string): Result<number, TemplateError> {
  const summary = listTemplates(root).find((t) => t.id === id);
  if (!summary) return fail('not-found', `No template ${id}`);
  const uses = templateUsage(root, id);
  if (uses.length > 0) {
    return fail('in-use', `Used by ${usedBy(uses)}`);
  }
  summary.versions.forEach((v) => rmSync(fileOf(root, summary.kind, id, v)));
  return ok(summary.versions.length);
}

/** Removes one version of a template, unless a document in this folder uses that version. Removing the only version removes the template. */
export function removeTemplateVersion(root: string, id: string, version: number): Result<number, TemplateError> {
  const summary = listTemplates(root).find((t) => t.id === id);
  if (!summary || !summary.versions.includes(version)) return fail('not-found', `No template ${id}@${version}`);
  const uses = templateUsage(root, id, version);
  if (uses.length > 0) {
    return fail('in-use', `v${version} is used by ${usedBy(uses)}`);
  }
  rmSync(fileOf(root, summary.kind, id, version));
  return ok(summary.versions.length - 1);
}

function groupOf(kind: string): TemplateGroup {
  return GROUP_OF[kind] ?? (GROUPS.some((g) => g.group === kind) ? (kind as TemplateGroup) : 'agent-instructions');
}

/** Folder holding the seed library: KEEL_SEED, or seed/ in the folder Keel runs from. */
export function seedDir(env: Record<string, string | undefined> = process.env): string {
  return env.KEEL_SEED?.trim() || join(process.cwd(), 'seed');
}
