// What Keel finds in a folder before it opens it (REQ-012, CR-0010): a local scan of file names, manifests and agent
// files. Nothing is sent anywhere and nothing is written. It tells the four cases apart: a new folder, a Keel folder,
// an existing project, and an existing project with its own AI setup.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repoFacts } from './facts';

export type FolderCase = 'new' | 'keel' | 'existing' | 'existing-ai';

export interface ShareableFile { path: string; size: number; why: string }

export interface FolderScan {
  kase: FolderCase;
  git: { repo: boolean; commits: number; contributors: number };
  stack?: string;
  manifests: string[];
  codeFiles: number;
  docs: string[];            // README and docs/*.md
  tests: number;             // files that look like tests
  agentFiles: string[];      // AGENTS.md, CLAUDE.md, .cursor/rules/…
  specTools: string[];       // specs/ (Spec Kit), .kiro/
  usedFolders: string[];     // docs/, tasks/, features/ that already hold something
  shareable: ShareableFile[];// what the assistant would read for a baseline, if the user agrees
  truncated: boolean;        // stopped at the file limit
}

const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage', 'vendor', 'target', '.venv', 'venv', '__pycache__', '.keel', '.turbo', '.cache', '.features-gen']);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|swift|c|cc|cpp|h|vue|svelte)$/;
const TEST = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|^test_.*\.py$/;
const AGENT_FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.cursorrules', '.windsurfrules', '.github/copilot-instructions.md'];
const AGENT_DIRS = ['.claude', '.cursor/rules'];
const MANIFESTS = ['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'Gemfile', 'composer.json'];
const MAX_FILES = 10_000;
const MAX_SHARE = 100 * 1024;

/** The folder's files, relative, without the skipped folders; stops at MAX_FILES. */
export function walk(root: string): { files: string[]; truncated: boolean } {
  const files: string[] = [];
  const stack = [root];
  while (stack.length && files.length < MAX_FILES) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) stack.push(join(dir, e.name));
      } else if (e.isFile()) {
        files.push(relative(root, join(dir, e.name)).split('\\').join('/'));
        if (files.length >= MAX_FILES) break;
      }
    }
  }
  return { files, truncated: files.length >= MAX_FILES };
}

function gitFacts(root: string): FolderScan['git'] {
  if (!existsSync(join(root, '.git'))) return { repo: false, commits: 0, contributors: 0 };
  const run = (...args: string[]) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim();
    } catch {
      return '';
    }
  };
  const commits = Number(run('rev-list', '--count', 'HEAD')) || 0;
  const contributors = commits ? run('shortlog', '-sn', 'HEAD').split('\n').filter(Boolean).length : 0;
  return { repo: true, commits, contributors };
}

const sizeOf = (root: string, path: string) => {
  try {
    return statSync(join(root, path)).size;
  } catch {
    return 0;
  }
};

export function scanFolder(root: string): FolderScan {
  const { files, truncated } = walk(root);
  const has = (path: string) => files.includes(path);
  const keel = existsSync(join(root, '.keel', 'config.yml'));
  const manifests = MANIFESTS.filter(has);
  const codeFiles = files.filter((f) => CODE.test(f) && !f.startsWith('features/steps/')).length;
  const docs = files.filter((f) => /^readme(\.[a-z]+)?$/i.test(f) || /^docs\/[^/]+\.md$/i.test(f)).sort();
  const tests = files.filter((f) => TEST.test(f)).length;
  const agentFiles = [...AGENT_FILES.filter(has), ...AGENT_DIRS.filter((d) => files.some((f) => f.startsWith(`${d}/`))).map((d) => `${d}/`)];
  const specTools = [...(files.some((f) => /^specs\/[^/]+\/spec\.md$/.test(f)) ? ['specs/ (Spec Kit)'] : []), ...(files.some((f) => f.startsWith('.kiro/')) ? ['.kiro/ (Kiro)'] : [])];
  const usedFolders = ['docs', 'tasks', 'features'].filter((d) => files.some((f) => f.startsWith(`${d}/`)));
  const project = manifests.length > 0 || codeFiles > 0;
  const kase: FolderCase = keel ? 'keel' : project ? (agentFiles.length || specTools.length ? 'existing-ai' : 'existing') : 'new';

  const share: ShareableFile[] = [];
  const offer = (path: string, why: string) => {
    if (!share.some((s) => s.path === path) && has(path)) share.push({ path, size: Math.min(sizeOf(root, path), MAX_SHARE), why });
  };
  docs.filter((d) => /^readme/i.test(d)).forEach((d) => offer(d, 'What the project is'));
  manifests.forEach((m) => offer(m, 'Stack and dependencies'));
  docs.filter((d) => !/^readme/i.test(d)).slice(0, 4).forEach((d) => offer(d, 'Project documentation'));
  AGENT_FILES.filter(has).forEach((f) => offer(f, 'Agent instructions and rules'));
  files.filter((f) => /^specs\/[^/]+\/spec\.md$/.test(f) || /^\.kiro\/specs\/[^/]+\/requirements\.md$/.test(f)).slice(0, 4).forEach((f) => offer(f, 'An existing spec'));

  return {
    kase, git: gitFacts(root), stack: project ? repoFacts(root).stack : undefined, manifests, codeFiles, docs, tests,
    agentFiles, specTools, usedFolders, shareable: share, truncated,
  };
}

/** The text of the files the user agreed to share, each capped, for the baseline draft. */
export function readShared(root: string, paths: string[], offered: ShareableFile[]): { path: string; text: string }[] {
  return paths.filter((p) => offered.some((o) => o.path === p)).map((path) => ({ path, text: readFileSync(join(root, path), 'utf8').slice(0, MAX_SHARE) }));
}

/** The code map for planning a change (CR-0013): file and folder names only, without Keel's own folders, capped. */
export function codeMap(root: string, max = 2000): string[] {
  return walk(root).files.filter((f) => !f.startsWith('.keel/') && !f.startsWith('changes/') && !f.startsWith('.github/')).sort().slice(0, max);
}

/** What the readiness rules need beyond the folder case (CR-0015). Names and short config only; read locally. */
export interface ScanFacts {
  files: string[];             // every file walked, relative
  tracked: string[];           // files git tracks or would track (not ignored); every file outside a repository
  lockfiles: string[];         // package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lock(b)
  ciWorkflows: string[];       // .github/workflows/*.yml, .gitlab-ci.yml, …
  lintConfigs: string[];       // eslint, prettier, biome, ruff, golangci, rubocop, editorconfig …
  testFiles: string[];         // files that look like tests
  gitignore: string[];         // the root .gitignore lines, trimmed, without comments
}

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock'];
const CI = /^(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.yml|bitbucket-pipelines\.yml|Jenkinsfile)$/;
const LINT = /^(eslint\.config\.[cm]?[jt]s|\.eslintrc(\.[a-z]+)?|\.prettierrc(\.[a-z]+)?|prettier\.config\.[cm]?js|biome\.jsonc?|ruff\.toml|\.ruff\.toml|\.flake8|\.pylintrc|\.golangci\.ya?ml|rustfmt\.toml|\.rubocop\.yml|\.editorconfig|\.stylelintrc(\.[a-z]+)?)$/;

function trackedFiles(root: string, files: string[]): string[] {
  if (!existsSync(join(root, '.git'))) return files;
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 32 * 1024 * 1024 });
    return out.split('\n').filter(Boolean).filter((f) => !f.split('/').some((part) => SKIP.has(part)));
  } catch {
    return files;
  }
}

export function scanFacts(root: string, files: string[] = walk(root).files): ScanFacts {
  const gitignore = existsSync(join(root, '.gitignore'))
    ? readFileSync(join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [];
  return {
    files,
    tracked: trackedFiles(root, files),
    lockfiles: LOCKFILES.filter((f) => files.includes(f)),
    ciWorkflows: files.filter((f) => CI.test(f)).sort(),
    lintConfigs: files.filter((f) => LINT.test(f)).sort(),
    testFiles: files.filter((f) => TEST.test(f) && !f.startsWith('features/fixtures/')).sort(),
    gitignore,
  };
}
