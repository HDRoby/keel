// The Keel standard for AI readiness (CR-0015, ADR-0018): rules decide, the model explains. Each rule looks at the
// local scan (and may read files locally) and passes, fails or does not apply, with the paths it is based on.
// Nothing here calls a model or sends anything.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type FolderScan, scanFacts, scanFolder, type ScanFacts, walk } from '../repo/scan';
import { uncovered } from '../scenarios/store';
import { rulesFromAgentFiles } from '../standards/from-agent-files';
import { findSecrets } from './secrets';

export const AREAS = ['Agent instructions', 'Project knowledge', 'Verification', 'Conventions', 'Agent tooling', 'Safety'] as const;
export type Area = (typeof AREAS)[number];
export type Impact = 'High' | 'Medium' | 'Low';
export type Effort = 'Small' | 'Medium' | 'Large';
export type Rating = 'Ready' | 'Partly' | 'Missing';
export type RuleStatus = 'pass' | 'fail' | 'na';

export interface Evidence { path: string; line?: number }
export interface ReadinessScan extends FolderScan { root: string; facts: ScanFacts }
export interface Check { status: RuleStatus; evidence: Evidence[]; params?: Record<string, string> }
export interface RuleResult extends Check { rule: string; area: Area }

export interface ReadinessRule {
  id: string;
  area: Area;
  passesWhen: string;
  check: (scan: ReadinessScan, read: (path: string) => string | undefined) => Check;
  advice: { title: string; why: string; impact: Impact; effort: Effort; action: 'add' | 'adopt'; fallback?: string };
}

/** Instruction files other than AGENTS.md (AI-02). */
const OTHER_INSTRUCTIONS = ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.windsurfrules'];
const MANAGERS = { 'package-lock.json': 'npm', 'pnpm-lock.yaml': 'pnpm', 'yarn.lock': 'yarn', 'bun.lockb': 'bun', 'bun.lock': 'bun' } as const;
const BUILTINS = new Set(['install', 'i', 'add', 'remove', 'rm', 'ci', 'exec', 'dlx', 'init', 'create', 'x', 'why', 'update', 'up', 'upgrade', 'outdated', 'publish', 'link', 'unlink', 'run', 'test', 'start', 'help', 'audit', 'list', 'ls', 'config', 'global', 'cache', 'set', 'version', 'pack', 'login', 'logout', 'info', 'store', 'import', 'prune', 'rebuild', 'workspace', 'dedupe']);
const TEST_RUNNERS = /^(vitest|jest|mocha|ava|tap|uvu|@playwright\/test|cypress|playwright-bdd|@cucumber\/cucumber|karma|jasmine|node:test)$/;
const CI_TESTS = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|verify|check)\b|\bnpm\s+t\b|\bpytest\b|\bgo test\b|\bcargo test\b|\bmake (test|check|verify)\b|\btox\b|\bmvn\b.*\b(test|verify)\b|\bgradle\w*\s+(test|check|build)\b/;
const GITIGNORE_SAMPLES: { pattern: string; sample: string }[] = [
  { pattern: '.env', sample: '.env' }, { pattern: '.env*.local', sample: '.env.development.local' },
  { pattern: '*.pem', sample: 'server.pem' }, { pattern: '*.key', sample: 'server.key' },
];

const pass = (evidence: Evidence[] = []): Check => ({ status: 'pass', evidence });
const fail = (evidence: Evidence[] = [], params?: Record<string, string>): Check => ({ status: 'fail', evidence, ...(params ? { params } : {}) });
const na: Check = { status: 'na', evidence: [] };

/** Agent instruction files, read for commands and package managers. */
function instructionFiles(scan: ReadinessScan): string[] {
  return scan.facts.files.filter((f) => ['AGENTS.md', ...OTHER_INSTRUCTIONS, '.cursorrules'].includes(f) || /^\.cursor\/rules\/[^/]+\.mdc?$/.test(f)).sort();
}

function lines(text: string): string[] {
  return text.split('\n');
}

/** The code in a text, line by line: fenced blocks whole, and `inline code` spans elsewhere; prose is blank. */
function codeLines(text: string): string[] {
  let fenced = false;
  return text.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? line : [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]).join(' ; ');
  });
}

/** `npm run x`, `pnpm x`, `yarn x`, `bun run x`, `make x` written as code in a text, with their line. */
export function namedCommands(text: string): { tool: 'script' | 'make'; name: string; line: number }[] {
  const found: { tool: 'script' | 'make'; name: string; line: number }[] = [];
  codeLines(text).forEach((line, i) => {
    for (const m of line.matchAll(/(?:^|[\s;&|$])(npm run|pnpm(?: run)?|yarn(?: run)?|bun run|make)\s+([A-Za-z][\w:.-]*)/g)) {
      const [, tool = '', name = ''] = m;
      if (tool !== 'npm run' && tool !== 'bun run' && !tool.endsWith(' run') && BUILTINS.has(name)) continue;
      found.push({ tool: tool === 'make' ? 'make' : 'script', name: name.replace(/[.:]+$/, ''), line: i + 1 });
    }
  });
  return found;
}

/** Package managers a text tells agents to use, ignoring ones it rules out ("never npm or yarn"), with their line. */
export function namedManagers(text: string): { manager: string; line: number }[] {
  const found: { manager: string; line: number }[] = [];
  lines(text).forEach((line, i) => {
    for (const clause of line.split(/[,;.:()]|\bbut\b/)) {
      const negated = /\b(never|not|don't|do not|avoid|no|instead of|rather than)\b/i.exec(clause);
      for (const m of clause.matchAll(/\b(npm|npx|pnpm|yarn|bun)\b/g)) {
        if (negated && (m.index ?? 0) > negated.index) continue;
        const manager = m[1] === 'npx' ? 'npm' : (m[1] as string);
        if (!found.some((f) => f.manager === manager && f.line === i + 1)) found.push({ manager, line: i + 1 });
      }
    }
  });
  return found;
}

function scripts(scan: ReadinessScan, read: (path: string) => string | undefined): Record<string, string> {
  try {
    return (JSON.parse(read('package.json') ?? '{}') as { scripts?: Record<string, string> }).scripts ?? {};
  } catch {
    return {};
  }
}

function packageDeps(read: (path: string) => string | undefined): string[] {
  try {
    const pkg = JSON.parse(read('package.json') ?? '{}') as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  } catch {
    return [];
  }
}

/** A simple .gitignore pattern match on a file name (enough for the samples SA-01 checks). */
function ignores(lines: string[], sample: string): boolean {
  let ignored = false;
  for (const raw of lines) {
    const negate = raw.startsWith('!');
    const pattern = raw.replace(/^!/, '').replace(/^\//, '').replace(/\/$/, '').replace(/^\*\*\//, '');
    const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
    if (regex.test(sample)) ignored = !negate;
  }
  return ignored;
}

export const RULES: ReadinessRule[] = [
  {
    id: 'AI-01', area: 'Agent instructions', passesWhen: 'AGENTS.md exists',
    check: (s) => (s.facts.files.includes('AGENTS.md') ? pass([{ path: 'AGENTS.md' }]) : fail()),
    advice: { title: 'Add AGENTS.md, drafted from the scripts and README', why: 'Every coding agent reads AGENTS.md first; without it each agent guesses how to build and test the project.', impact: 'High', effort: 'Small', action: 'add' },
  },
  {
    id: 'AI-02', area: 'Agent instructions', passesWhen: 'Every other instruction file points to AGENTS.md, or there is only one',
    check: (s, read) => {
      const others = OTHER_INSTRUCTIONS.filter((f) => s.facts.files.includes(f));
      const all = [...(s.facts.files.includes('AGENTS.md') ? ['AGENTS.md'] : []), ...others];
      if (all.length <= 1) return all.length ? pass([{ path: all[0] as string }]) : na;
      const apart = others.filter((f) => !/AGENTS\.md/.test(read(f) ?? ''));
      return apart.length ? fail(apart.map((path) => ({ path }))) : pass(others.map((path) => ({ path })));
    },
    advice: { title: 'Make AGENTS.md the single source', why: 'Instruction files that say different things make agents behave differently depending on the tool.', impact: 'High', effort: 'Small', action: 'add' },
  },
  {
    id: 'AI-03', area: 'Agent instructions', passesWhen: 'Every npm run, pnpm, yarn, bun run or make command named in agent files exists',
    check: (s, read) => {
      const files = instructionFiles(s);
      if (!files.length) return na;
      const known = scripts(s, read);
      const makefile = read('Makefile') ?? '';
      const missing: Evidence[] = [];
      for (const file of files) {
        for (const c of namedCommands(read(file) ?? '')) {
          const exists = c.tool === 'make' ? new RegExp(`^${c.name.replace(/[.]/g, '\\.')}\\s*:`, 'm').test(makefile) : c.name in known;
          if (!exists) missing.push({ path: file, line: c.line });
        }
      }
      return missing.length ? fail(missing, { file: (missing[0] as Evidence).path }) : pass(files.map((path) => ({ path })));
    },
    advice: { title: 'Fix the command in {file}', why: 'An agent that runs a command that does not exist stops, or invents another one.', impact: 'High', effort: 'Small', action: 'add' },
  },
  {
    id: 'AI-04', area: 'Agent instructions', passesWhen: 'The package manager named in agent files matches the lockfile',
    check: (s, read) => {
      const lock = s.facts.lockfiles[0] as keyof typeof MANAGERS | undefined;
      if (!lock) return na;
      const manager = MANAGERS[lock];
      const named = instructionFiles(s).flatMap((path) => namedManagers(read(path) ?? '').map((m) => ({ ...m, path })));
      if (!named.length) return na;
      const wrong = named.filter((m) => m.manager !== manager);
      return wrong.length ? fail([...wrong.map((m) => ({ path: m.path, line: m.line })), { path: lock }], { manager }) : pass([{ path: lock }]);
    },
    advice: { title: 'Use {manager} everywhere', why: 'A different package manager writes a different lockfile and can install different versions.', impact: 'Medium', effort: 'Small', action: 'add' },
  },
  {
    id: 'PK-01', area: 'Project knowledge', passesWhen: 'README exists and has a section on running or developing',
    check: (s, read) => {
      const readme = s.facts.files.find((f) => /^readme(\.md|\.markdown|\.txt|\.rst)?$/i.test(f));
      if (!readme) return fail();
      const at = lines(read(readme) ?? '').findIndex((l) => /^#{1,4}\s.*\b(run|running|getting started|quick ?start|usage|develop|development|developing|install|installation|setup|set up|build|contributing)\b/i.test(l));
      return at >= 0 ? pass([{ path: readme, line: at + 1 }]) : fail([{ path: readme }]);
    },
    advice: { title: 'Add how to run it to the README', why: 'Agents and new people both start from the README to find how to run and test the project.', impact: 'Medium', effort: 'Small', action: 'add' },
  },
  {
    id: 'PK-02', area: 'Project knowledge', passesWhen: 'Requirements exist (docs/intent.md, docs/spec.md, Spec Kit or Kiro specs)',
    check: (s) => {
      const found = s.facts.files.filter((f) => f === 'docs/intent.md' || f === 'docs/spec.md' || /^specs\/[^/]+\/spec\.md$/.test(f) || /^\.kiro\/specs\//.test(f));
      return found.length ? pass(found.slice(0, 3).map((path) => ({ path }))) : fail();
    },
    advice: { title: 'Record requirements as a baseline', why: 'Without written requirements an agent cannot tell a bug from a feature, or check its work against what was asked.', impact: 'Medium', effort: 'Medium', action: 'add' },
  },
  {
    id: 'PK-03', area: 'Project knowledge', passesWhen: 'Decision records exist (docs/decisions/, docs/adr/, adr/)',
    check: (s) => {
      const found = s.facts.files.filter((f) => /^(docs\/decisions|docs\/adr|adr|doc\/adr)\/[^/]+\.md$/.test(f));
      return found.length ? pass([{ path: (found[0] as string).replace(/[^/]+$/, '') }]) : fail();
    },
    advice: { title: 'Record the main decisions as a baseline', why: 'Decision records tell an agent why the stack and structure are what they are, so it does not undo them.', impact: 'Medium', effort: 'Medium', action: 'add' },
  },
  {
    id: 'VE-01', area: 'Verification', passesWhen: 'A test runner is configured and test files exist',
    check: (s, read) => {
      const script = scripts(s, read).test;
      const configured = packageDeps(read).some((d) => TEST_RUNNERS.test(d)) || (script !== undefined && !/no test specified/.test(script))
        || s.facts.files.some((f) => /^(pytest\.ini|tox\.ini|go\.mod|Cargo\.toml|phpunit\.xml(\.dist)?|vitest\.config\.[cm]?[jt]s|jest\.config\.[cm]?[jt]s|playwright\.config\.[cm]?[jt]s)$/.test(f));
      const tests = s.facts.testFiles;
      const named = [...tests.filter((f) => /\.(test|spec)\.[a-z]+$/.test(f)), ...tests.filter((f) => !/\.(test|spec)\.[a-z]+$/.test(f))];
      if (configured && tests.length) return pass(named.slice(0, 3).map((path) => ({ path })));
      return fail(s.manifests.map((path) => ({ path })));
    },
    advice: { title: 'Add a test runner and a first test', why: 'Tests are how an agent knows its change works; without them every change needs a person to check it.', impact: 'High', effort: 'Medium', action: 'add' },
  },
  {
    id: 'VE-02', area: 'Verification', passesWhen: 'A CI workflow runs the test script',
    check: (s, read) => {
      const running = s.facts.ciWorkflows.filter((f) => CI_TESTS.test(read(f) ?? ''));
      if (running.length) return pass(running.map((path) => ({ path })));
      return fail(s.facts.ciWorkflows.map((path) => ({ path })));
    },
    advice: { title: 'Run the tests in CI', why: 'CI runs the tests on every change, including the ones an agent pushes, so a broken change is caught before review.', impact: 'High', effort: 'Medium', action: 'add' },
  },
  {
    id: 'VE-03', area: 'Verification', passesWhen: 'Acceptance scenarios exist; in a Keel folder, every requirement has one',
    check: (s) => {
      const features = s.facts.files.filter((f) => f.endsWith('.feature') && !f.startsWith('features/fixtures/'));
      if (!features.length) return fail();
      if (s.kase !== 'keel') return pass(features.slice(0, 3).map((path) => ({ path })));
      const open = uncovered(s.root);
      return open.length ? fail([{ path: 'docs/spec.md' }], { reqs: open.join(', ') }) : pass(features.slice(0, 3).map((path) => ({ path })));
    },
    advice: { title: 'Add scenarios for {reqs}', fallback: 'Add acceptance scenarios', why: 'Acceptance scenarios say in plain words when a requirement is done, and an agent can run them.', impact: 'Medium', effort: 'Medium', action: 'add' },
  },
  {
    id: 'CO-01', area: 'Conventions', passesWhen: 'Lint or format config exists',
    check: (s) => (s.facts.lintConfigs.length ? pass(s.facts.lintConfigs.map((path) => ({ path }))) : fail()),
    advice: { title: 'Add a linter config', why: 'A linter keeps an agent\'s code in the project\'s style without anyone having to say so.', impact: 'Low', effort: 'Small', action: 'add' },
  },
  {
    id: 'CO-02', area: 'Conventions', passesWhen: 'Conventions are readable by agents (.keel/standards, skills, or rules in agent files)',
    check: (s) => {
      const standards = s.facts.files.filter((f) => f.startsWith('.keel/standards/') || /^\.claude\/skills\//.test(f));
      if (standards.length) return pass([{ path: standards[0]?.startsWith('.keel/') ? '.keel/standards/' : '.claude/skills/' }]);
      const rules = rulesFromAgentFiles(s.root);
      if (rules.length) return pass([...new Set(rules.map((r) => r.source))].map((path) => ({ path })));
      return fail(s.facts.lintConfigs.map((path) => ({ path })));
    },
    advice: { title: 'Turn the lint config into a standard', why: 'A linter checks code after it is written; a standard tells the agent the conventions before it writes.', impact: 'Low', effort: 'Small', action: 'add' },
  },
  {
    id: 'AT-01', area: 'Agent tooling', passesWhen: 'A verifier subagent or equivalent exists (.claude/agents/, agent kit)',
    check: (s) => {
      const found = s.facts.files.filter((f) => /^(\.claude\/agents|\.keel\/agent-kit|\.github\/agents|\.cursor\/agents)\/.*(verif|review|test|qa)/i.test(f));
      return found.length ? pass([{ path: found[0] as string }]) : fail();
    },
    advice: { title: 'Add a verifier subagent', why: 'A verifier runs the app and the scenarios before an agent says it is done, so you review finished work.', impact: 'Medium', effort: 'Small', action: 'add' },
  },
  {
    id: 'AT-02', area: 'Agent tooling', passesWhen: 'Rules are not limited to one tool (not only .cursor/rules or only .windsurfrules)',
    check: (s) => {
      const tools = [
        ...(s.facts.files.some((f) => f.startsWith('.cursor/rules/')) || s.facts.files.includes('.cursorrules') ? [{ tool: 'Cursor', path: s.facts.files.includes('.cursorrules') ? '.cursorrules' : '.cursor/rules/' }] : []),
        ...(s.facts.files.includes('.windsurfrules') ? [{ tool: 'Windsurf', path: '.windsurfrules' }] : []),
      ];
      if (!tools.length) return na;
      const shared = s.facts.files.includes('AGENTS.md') || s.facts.files.some((f) => f.startsWith('.keel/standards/'));
      return shared ? pass([{ path: 'AGENTS.md' }]) : fail(tools.map((t) => ({ path: t.path })), { tool: tools.map((t) => t.tool).join(' and ') });
    },
    advice: { title: 'Adopt the {tool} rules as standards', why: 'Rules kept in one tool\'s folder are invisible to every other agent.', impact: 'Medium', effort: 'Small', action: 'adopt' },
  },
  {
    id: 'SA-01', area: 'Safety', passesWhen: '.gitignore covers .env, .env*.local, *.pem, *.key',
    check: (s) => {
      const missing = GITIGNORE_SAMPLES.filter((g) => !ignores(s.facts.gitignore, g.sample)).map((g) => g.pattern);
      const evidence = s.facts.files.includes('.gitignore') ? [{ path: '.gitignore' }] : [];
      return missing.length ? fail(evidence, { patterns: missing.join(', ') }) : pass(evidence);
    },
    advice: { title: 'Add {patterns} to .gitignore', why: 'Keys in .env files and certificates are committed by accident when git does not ignore them.', impact: 'High', effort: 'Small', action: 'add' },
  },
  {
    id: 'SA-02', area: 'Safety', passesWhen: 'No tracked file looks like a secret (by name, or a key-like field with a value in config)',
    check: (s) => {
      const hits = findSecrets(s.root, s.facts.tracked);
      if (!hits.length) return pass();
      const first = hits[0] as { path: string; field?: string };
      return fail(hits.map((h) => ({ path: h.path })), { file: first.path, ...(first.field ? { field: first.field } : {}) });
    },
    advice: { title: 'Remove the key from {file}, move it to an environment variable and rotate it', why: 'A key in a tracked file is readable by anyone with the repository, and by every agent that reads the folder.', impact: 'High', effort: 'Small', action: 'add' },
  },
];

/** The rule's advice title with its parameters filled in. */
export function adviceTitle(rule: ReadinessRule, params: Record<string, string> = {}): string {
  const keys = [...rule.advice.title.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);
  if (rule.advice.fallback && keys.some((k) => !params[k])) return rule.advice.fallback;
  return rule.advice.title.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? key);
}

/** The scan the rules work on: the folder case plus the facts they need. */
export function readinessScan(root: string): ReadinessScan {
  const folder = scanFolder(root);
  // The folder walk skips .keel; its standards and agent kit count for the rules.
  const keel = existsSync(join(root, '.keel')) ? walk(join(root, '.keel')).files.map((f) => `.keel/${f}`) : [];
  return { ...folder, root, facts: scanFacts(root, [...walk(root).files, ...keel]) };
}

const MAX_READ = 256 * 1024;
/** Reads a file in the folder for a rule, locally; undefined when missing, unreadable or too large. */
export function localReader(root: string): (path: string) => string | undefined {
  const cache = new Map<string, string | undefined>();
  return (path) => {
    if (!cache.has(path)) {
      const file = join(root, path);
      try {
        cache.set(path, existsSync(file) && statSync(file).size <= MAX_READ ? readFileSync(file, 'utf8') : undefined);
      } catch {
        cache.set(path, undefined);
      }
    }
    return cache.get(path);
  };
}

/** Every rule on the scan. In a new folder every rule fails: there is nothing yet (CR-0015). */
export function runRules(scan: ReadinessScan, read = localReader(scan.root)): RuleResult[] {
  return RULES.map((rule) => ({ rule: rule.id, area: rule.area, ...(scan.kase === 'new' ? fail() : rule.check(scan, read)) }));
}

/** Ready when every applicable rule passes, Missing when every one fails, otherwise Partly. */
export function areaRating(results: RuleResult[], area: Area): Rating {
  const applicable = results.filter((r) => r.area === area && r.status !== 'na');
  if (!applicable.length || applicable.every((r) => r.status === 'pass')) return 'Ready';
  return applicable.every((r) => r.status === 'fail') ? 'Missing' : 'Partly';
}

export function ruleById(id: string): ReadinessRule | undefined {
  return RULES.find((r) => r.id === id);
}
