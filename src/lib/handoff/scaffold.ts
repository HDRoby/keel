// The handoff package (REQ-006, task T8a): a repository scaffold any coding agent can build from.
// AGENTS.md, CLAUDE.md, REVIEW.md, docs, tasks, failing acceptance scenarios with step stubs, the agent kit,
// the standards and CI. Keel's own repository is an example of the output. It never contains application code.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { fillSections } from '../brainstorm/sections';
import { githubToken } from '../github/auth';
import { projectState } from '../gates/approvals';
import { gateFor } from '../gates/rules';
import { listMocks } from '../mocks/references';
import { currentSet, readSets, type MockSet } from '../mocks/sets';
import { readSkillFile } from '../skill-files';
import { PROVIDER_IDS } from '../providers/types';
import { fail, ok, type Result } from '../result';
import { providerConfig } from '../settings/settings';
import { standardsFor } from '../standards/library';
import type { Store } from '../store/db';
import { readDocument } from '../store/documents';
import { readConfig, readProject, updateConfig } from '../store/workspace';
import { listTemplates, readTemplate } from '../templates/library';
import { renderTemplate } from '../templates/render';
import { buildTrace, traceabilityJson } from '../trace/index';
import { requirementStatements } from '../trace/parse';
import { scanForSecrets } from './secrets-scan';
import { stepStubs, type FeatureFile } from './stubs';
import type { ZipEntry } from './zip';

/** A file of the package: its path in the repository and its bytes. */
export type PackageFile = ZipEntry;

export type HandoffError = 'locked' | 'not-found' | 'secrets-found' | 'invalid-input';

/** The commands the coding agent and CI run. Keel does not know the project's stack, so the proposer sets them. */
export const commandsSchema = z.strictObject({
  install: z.string().trim().min(1).max(200),
  run: z.string().trim().min(1).max(200),
  test: z.string().trim().min(1).max(200),
  scenarios: z.string().trim().min(1).max(200),
  verify: z.string().trim().min(1).max(200),
});
export type Commands = z.infer<typeof commandsSchema>;

export const DEFAULT_COMMANDS: Commands = {
  install: 'npm install', run: 'npm run dev', test: 'npm test', scenarios: 'npm run test:bdd', verify: 'npm run verify',
};

/** The handoff commands saved in .keel/config.yml, or the defaults. */
export function handoffCommands(store: Pick<Store, 'root'>): Commands {
  const parsed = commandsSchema.safeParse(readConfig(store.root)?.commands);
  return parsed.success ? parsed.data : DEFAULT_COMMANDS;
}

/** Saves the handoff commands in .keel/config.yml. */
export async function saveHandoffCommands(store: Store, commands: Commands): Promise<Result<Commands, HandoffError>> {
  const project = readProject(store.root);
  if (!project.ok) return fail('not-found', project.message);
  const parsed = commandsSchema.safeParse(commands);
  if (!parsed.success) return fail('invalid-input', 'Every command needs a value');
  const saved = await updateConfig(store, { commands: parsed.data }, 'Keel: handoff commands');
  return saved.ok ? ok(parsed.data) : fail('not-found', saved.message);
}

const text = (path: string, content: string): PackageFile => ({ path, data: new TextEncoder().encode(content.endsWith('\n') ? content : `${content}\n`) });

function filesUnder(dir: string, folder: string, filter: (name: string) => boolean): string[] {
  const full = join(dir, folder);
  if (!existsSync(full)) return [];
  return readdirSync(full).filter(filter).sort().map((f) => `${folder}/${f}`);
}

/** A template's body with placeholders filled and its guidance comments replaced by the given sections. */
function fromTemplate(home: string, id: string, values: Record<string, string>, sections: Record<string, string> = {}): string | undefined {
  const template = readTemplate(home, id);
  if (!template.ok) return undefined;
  const body = renderTemplate(template.value.content, values).body;
  return fillSections(body, Object.fromEntries(Object.entries(sections).map(([h, t]) => [h, [t]])));
}

/** Builds every file of the handoff package. Refuses while the Handoff stage is locked, or if a secret is found. */
export async function buildHandoff(store: Store): Promise<Result<PackageFile[], HandoffError>> {
  const gate = gateFor(projectState(store), 'handoff');
  if (!gate.available) return fail('locked', gate.reason ?? 'The handoff stage is locked');
  const project = readProject(store.root);
  if (!project.ok) return fail('not-found', project.message);
  const dir = store.root;
  const intent = readDocument(store, 'docs/intent.md');
  const plan = readDocument(store, 'docs/plan.md');
  if (!intent.ok || !plan.ok) return fail('not-found', 'The handoff needs intent.md and plan.md');
  const commands = handoffCommands(store);
  const title = project.value.title;
  const standards = standardsFor(store.root, project.value.standards);
  const pathValues = { plan_path: '`docs/plan.md`', spec_path: '`docs/spec.md`', traceability_path: '`docs/traceability.json`' };
  const kit = listTemplates(store.root).filter((t) => t.group === 'agent-kit' && t.id !== 'review');
  const kitFiles = kit.flatMap((t) => {
    const template = readTemplate(store.root, t.id);
    if (!template.ok) return [];
    const parsed = matter(template.value.content, {});
    const header: Record<string, unknown> = { ...parsed.data };
    delete header.template_version;
    const body = renderTemplate(template.value.content, {
      ...pathValues, run_command: `\`${commands.run}\``, scenario_command: `\`${commands.scenarios} -- --grep "@REQ-xxx"\``,
      verify_command: `\`${commands.verify}\``,
    }).body;
    return [{ id: t.id, description: typeof header.description === 'string' ? header.description : '', file: text(`.claude/agents/${t.id}.md`, matter.stringify(`\n${body}`, header)) }];
  });

  const files: PackageFile[] = [];
  const copied = new Set<string>();   // documents taken as they are, not generated from a template
  const copy = (path: string) => {
    if (!existsSync(join(dir, path))) return;
    files.push({ path, data: new Uint8Array(readFileSync(join(dir, path))) });
    copied.add(path);
  };

  // Documents, decisions, mock references, tasks and scenarios, as they are in the project.
  ['docs/intent.md', 'docs/spec.md', 'docs/plan.md'].forEach(copy);
  filesUnder(dir, 'docs/decisions', (f) => f.endsWith('.md')).forEach(copy);
  if (listMocks(dir).length > 0) filesUnder(dir, '.keel/mocks', () => true).forEach(copy);
  const mockSet = currentSet(dir);
  if (mockSet) {
    // README and every set folder; sets hold only files.
    copy('docs/mocks/README.md');
    readSets(dir).forEach((set) => filesUnder(dir, `docs/mocks/set-${set.set}`, () => true).forEach(copy));
  }
  filesUnder(dir, 'tasks', (f) => f.endsWith('.md')).forEach(copy);
  const features: FeatureFile[] = filesUnder(dir, 'features', (f) => f.endsWith('.feature'))
    .map((path) => ({ path, content: readFileSync(join(dir, path), 'utf8') }));
  features.forEach((f) => {
    files.push(text(f.path, f.content));
    copied.add(f.path);
  });
  stepStubs(features).forEach((s) => files.push(text(s.path, s.content)));

  // The roadmap: the project's own, or Now from the requirements in the intent.
  if (existsSync(join(dir, 'docs/roadmap.md'))) copy('docs/roadmap.md');
  else {
    const now = Object.entries(requirementStatements(intent.value.body)).map(([id, s]) => `- ${s} (${id})`).join('\n');
    const roadmap = fromTemplate(store.root, 'roadmap', { title, current_release: 'v0.1' }, {
      'Now (v0.1)': now || '- The requirements in docs/intent.md', Next: '- Nothing yet.', Later: '- Nothing yet.', 'Not doing': '- Code generation inside Keel: coding agents build.',
    });
    if (roadmap) files.push(text('docs/roadmap.md', matter.stringify(`\n${roadmap}`, { project: project.value.id, template: 'roadmap@1', updated: project.value.created })));
  }
  files.push(text('docs/traceability.json', traceabilityJson(buildTrace(dir), project.value.id, (store.now?.() ?? new Date()).toISOString().slice(0, 10))));

  // Instructions for any agent (AGENTS.md), for Claude Code (CLAUDE.md, .claude/), and for reviewers (REVIEW.md).
  const standardsSummary = standards.length === 0 ? '- No standards were selected for this project.'
    : standards.map((s) => `- **${s.name} v${s.version}:** ${s.description}`).join('\n');
  const agents = fromTemplate(store.root, 'agents', {
    commands: [`- Install: \`${commands.install}\``, `- Run: \`${commands.run}\``, `- Unit tests: \`${commands.test}\``, `- Acceptance scenarios: \`${commands.scenarios}\``, `- All checks: \`${commands.verify}\``].join('\n'),
    standards_summary: `${standardsSummary}\n\nClaude Code loads these as skills from \`.claude/skills/\`; other agents follow this summary.`,
    verify_command: `Run before reporting a task done, and paste the output:\n\n\`\`\`\n${commands.verify}\n\`\`\`\n\nIf a test fails, fix the code, not the test.`,
    agent_kit_summary: ['Claude Code uses the subagents in `.claude/agents/`. Other agents: apply these roles yourself.', '', ...kitFiles.map((k) => `- **${k.id}:** ${k.description}`)].join('\n'),
  }, {
    'Read first': ['1. `docs/intent.md`: what we want and why', '2. `docs/spec.md`: requirements and the design', '3. `docs/plan.md`: ordered tasks and test strategy', '4. `docs/roadmap.md`: what is in scope now', '5. `docs/decisions/`: why things are the way they are', '6. `docs/traceability.json`: which tasks and scenarios each requirement reaches'].join('\n'),
    'How to work': ['1. Take the next task in `tasks/` in order. Each task lists its requirements and the scenarios that prove it.', '2. The scenarios in `features/` already exist and fail. Implement the step definitions in `features/steps/` and the code until they pass.', '3. **Never edit `.feature` files to make a scenario pass.** If a scenario looks wrong, write it under "Questions for the owner" in the task file and stop.', '4. If your work departs from `docs/plan.md`, update `docs/plan.md` in the same commit and say why. Keel reads these changes back.'].join('\n'),
    'Done means': ['- Every scenario tagged with the task\'s requirements passes in CI.', `- \`${commands.verify}\` passes.`, '- `docs/plan.md` matches what was built.'].join('\n'),
  });
  if (agents) files.push(text('AGENTS.md', mockSet ? `${agents.trimEnd()}\n\n${visualReference(mockSet)}\n` : agents));
  files.push(text('CLAUDE.md', [
    '# CLAUDE.md', '', 'Read `AGENTS.md`. It is the single source of instructions for every coding agent working on this repository.', '',
    'Claude Code also gets:', `- subagents in \`.claude/agents/\` (${kitFiles.map((k) => k.id).join(', ') || 'none'})`,
    `- standards as skills in \`.claude/skills/\`${standards.length ? ` (${standards.map((s) => s.id).join(', ')})` : ''}`,
  ].join('\n')));
  kitFiles.forEach((k) => files.push(k.file));
  standards.forEach((s) => {
    const source = readSkillFile(store.root, 'standards', s.ref) ?? '';
    files.push(text(`.claude/skills/${s.id}/SKILL.md`, source));
  });
  const review = fromTemplate(store.root, 'review', pathValues, {
    'What Important means here': 'A bug the change adds or makes worse, a security problem (cite the standard and rule, for example "Security baseline v2, rule 1"), or a departure from `docs/spec.md` or `docs/plan.md` that the plan does not record.',
    'Do not report': ['- Style the linter already checks.', '- Changes outside the diff, unless the diff breaks them.', '- Personal preferences without a rule or a bug behind them.'].join('\n'),
  });
  if (review) files.push(text('REVIEW.md', review));

  // CI, a README and, for the default npm stack, a minimal setup the commands can run.
  const setup = minimalSetup(title, commands);
  setup.forEach((f) => files.push(text(f.path, f.content)));
  files.push(text('.github/workflows/ci.yml', [
    'name: CI', '', 'on:', '  push:', '  pull_request:', '', 'jobs:', '  verify:', '    runs-on: ubuntu-latest', '    steps:',
    '      - uses: actions/checkout@v7',
    ...(/^(npm|npx|pnpm|yarn)\b/.test(commands.install) ? ['      - uses: actions/setup-node@v7', '        with:', '          node-version: 22'] : []),
    `      - run: ${commands.install}`,
    ...(setup.length ? ['      - run: npx playwright install --with-deps chromium'] : []),
    `      - run: ${commands.verify}`,
    // Keel reads these results back per requirement (T9): keep them even when the scenarios fail.
    ...(setup.length ? ['      - name: Keep scenario results for Keel read-back', '        if: always()', '        uses: actions/upload-artifact@v7', '        with:', '          name: bdd-results', '          path: test-results/bdd.json'] : []),
  ].join('\n')));
  files.push(text('README.md', [
    `# ${title}`, '',
    `Planned with Keel (${project.value.id}). Coding agents start with \`AGENTS.md\`; the intent, spec and plan are in \`docs/\`, the tasks in \`tasks/\`, and the acceptance scenarios in \`features/\`.`,
  ].join('\n')));

  // Every placeholder Keel fills must be filled: an agent reading "{{verify_command}}" is not helped.
  // Documents taken as they are may mention placeholders on purpose (a task about templates, for example).
  const decoderForPlaceholders = new TextDecoder('utf-8', { fatal: false });
  const unfilled = files.filter((f) => !copied.has(f.path) && /\{\{\s*[a-z_]+\s*\}\}/.test(decoderForPlaceholders.decode(f.data))).map((f) => f.path);
  if (unfilled.length > 0) return fail('invalid-input', `Unfilled template placeholders in ${unfilled.join(', ')}; check the templates`);

  // Never hand off a key or token (Security baseline v2, rule 1).
  const github = githubToken(store);
  const stored = [...PROVIDER_IDS.flatMap((id) => {
    const config = providerConfig(store, id);
    return config.ok && config.value.apiKey ? [config.value.apiKey] : [];
  }), ...(github ? [github] : [])];
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const findings = scanForSecrets(files.map((f) => ({ path: f.path, text: decoder.decode(f.data) })), stored);
  if (findings.length > 0) {
    return fail('secrets-found', `The package was not written: ${findings.map((f) => `${f.kind} in ${f.path} line ${f.line}`).join('; ')}`);
  }
  return ok(files.sort((a, b) => a.path.localeCompare(b.path)));
}

/** Script names the commands call, such as "test:bdd" for "npm run test:bdd" and "test" for "npm test". */
function npmScript(command: string): string | undefined {
  return /^npm (?:run )?([\w:.-]+)$/.exec(command.trim())?.[1];
}

/**
 * A minimal setup for the default stack (owner decision, T8a): package.json with scripts for the commands,
 * TypeScript, Vitest and playwright-bdd, so CI runs from the first commit. The scenarios fail until the
 * agent builds the tasks. Left out when the commands are not npm.
 */
export function minimalSetup(title: string, commands: Commands): { path: string; content: string }[] {
  if (!/^npm (install|ci)\b/.test(commands.install)) return [];
  const scripts: Record<string, string> = {};
  const add = (command: string, script: string) => {
    const name = npmScript(command);
    if (name && name !== 'install') scripts[name] = script;
  };
  add(commands.run, 'echo "No app yet: the coding agent adds the dev server in the first task" && exit 1');
  add(commands.test, 'vitest run --passWithNoTests');
  add(commands.scenarios, 'bddgen && playwright test');
  const verify = [commands.test, commands.scenarios].filter((c) => npmScript(c)).join(' && ');
  add(commands.verify, verify || 'echo "Set the verify script" && exit 1');
  const name = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  return [
    { path: 'package.json', content: `${JSON.stringify({
      name, version: '0.1.0', private: true, type: 'module', scripts,
      devDependencies: { '@playwright/test': '^1.65.1', '@types/node': '^22.0.0', 'playwright-bdd': '^9.2.1', typescript: '^5.6.0', vitest: '^5.1.1' },
    }, null, 2)}\n` },
    { path: 'tsconfig.json', content: `${JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noImplicitAny: true, skipLibCheck: true, noEmit: true },
      include: ['**/*.ts'], exclude: ['node_modules', '.features-gen'],
    }, null, 2)}\n` },
    { path: 'playwright.config.ts', content: [
      "import { defineConfig } from '@playwright/test';",
      "import { defineBddConfig } from 'playwright-bdd';", '',
      "const testDir = defineBddConfig({ features: 'features/*.feature', steps: 'features/steps/*.ts' });", '',
      '// Add a webServer here once the app exists, so the scenarios run against it.',
      "export default defineConfig({ testDir, reporter: [['list'], ['json', { outputFile: 'test-results/bdd.json' }]] });", '',
    ].join('\n') },
    { path: '.gitignore', content: ['node_modules/', '.features-gen/', 'test-results/', 'playwright-report/', '.env', '.env.local', ''].join('\n') },
  ];
}

/** The AGENTS.md section that points to the current mock set (CR-0009): HTML sources first, then the PNGs. */
function visualReference(set: MockSet): string {
  const html = set.files.filter((f) => f.kind === 'html');
  return [
    '## Visual reference', '',
    `The current mock set is \`docs/mocks/set-${set.set}/\`, made from spec v${set.specVersion} (see \`docs/mocks/README.md\`). The spec decides; the mocks show intent.`,
    html.length ? 'Read the HTML sources first for exact structure, sizes and copy, then compare with the PNGs:' : 'Compare UI work with the screens:',
    ...[...html, ...set.files.filter((f) => f.kind === 'png')].map((f) => `- \`docs/mocks/set-${set.set}/${f.path}\`: ${f.number ? `${f.number} · ` : ''}${f.screen ?? f.source}${f.reqs.length ? ` (${f.reqs.join(', ')})` : ''}`),
    ...(set.link ? [`- Live prototype: ${set.link}`] : []),
  ].join('\n');
}
