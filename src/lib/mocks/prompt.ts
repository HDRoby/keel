// The clickable mock prompt (REQ-010, task R14): a markdown prompt built from the spec for an external model that
// makes clickable prototypes. Pure assembly from the project files, no model call. Keel never draws mocks.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chosenOption, readDesign } from '../decisions/design';
import { requirementStatements } from '../trace/parse';
import { acceptedScenarios } from '../scenarios/store';
import type { Store } from '../store/store';
import { readDocument } from '../store/documents';
import type { Screen } from './match';

/**
 * The screens to ask for: one per feature file (an area of the product), with the requirement IDs its scenarios
 * prove, in requirement order; requirements no scenario covers get a screen each. Numbered in order.
 */
export function inferScreens(root: string, requirements: Record<string, string>): Screen[] {
  const byFeature = new Map<string, { title: string; names: string[]; reqs: Set<string> }>();
  for (const s of acceptedScenarios(root)) {
    const entry = byFeature.get(s.file) ?? { title: s.feature || s.file.replace(/^.*\/|\.feature$/g, ''), names: [], reqs: new Set<string>() };
    entry.names.push(s.name);
    s.requirements.forEach((r) => entry.reqs.add(r));
    byFeature.set(s.file, entry);
  }
  const covered = new Set([...byFeature.values()].flatMap((e) => [...e.reqs]));
  const areas = [...byFeature.values()].map((e) => ({ name: e.title, shows: e.names.slice(0, 3).join('; '), reqs: [...e.reqs].sort() }))
    .sort((a, b) => (a.reqs[0] ?? '').localeCompare(b.reqs[0] ?? ''));
  const rest = Object.entries(requirements).filter(([id]) => !covered.has(id)).map(([id, statement]) => ({ name: statement, shows: statement, reqs: [id] }));
  return [...areas, ...rest].map((s, i) => ({ number: String(i + 1).padStart(2, '0'), ...s }));
}

const section = (body: string, heading: string) => new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body)?.[1]?.replace(/<!--[\s\S]*?-->/g, '').trim() ?? '';

export interface MockPrompt { specVersion: number; title: string; screens: Screen[]; text: string; fileName: string }

/** Locked and empty states the scenarios describe, so the mock shows them. */
function statesFrom(root: string): string[] {
  return acceptedScenarios(root).filter((s) => /\b(locked|empty|no |none|not yet|missing)\b/i.test(`${s.name} ${s.steps.map((x) => x.text).join(' ')}`)).map((s) => s.name).slice(0, 8);
}

export function mockPrompt(store: Store): MockPrompt | undefined {
  const spec = readDocument(store, 'docs/spec.md');
  if (!spec.ok) return undefined;
  const intent = readDocument(store, 'docs/intent.md');
  const version = spec.value.header.version;
  const title = spec.value.header.title;
  const requirements = { ...(intent.ok ? requirementStatements(intent.value.body) : {}), ...requirementStatements(spec.value.body) };
  const screens = inferScreens(store.root, requirements);
  const design = readDesign(store.root).topics;
  const choice = (id: string) => { const t = design.find((x) => x.id === id); const c = t ? chosenOption(t) : undefined; return c ? `${c.name}${c.summary ? ` (${c.summary})` : ''}` : undefined; };
  const problem = intent.ok ? section(intent.value.body, 'Problem') : '';
  const who = intent.ok ? section(intent.value.body, 'Who it is for') : '';
  const uiStandard = existsSync(join(store.root, 'docs', 'ui-guide.md')) ? '`docs/ui-guide.md` (tokens and components; attach it)' : 'a clean, neutral design: system font, one accent colour, cards on a light grey page';
  const states = statesFrom(store.root);
  const lines = [
    `# Clickable mock request: ${title} (spec v${version})`, '',
    'Build a clickable prototype of the screens below, one screen per artboard, linked so I can click through.',
    'Use realistic sample data from this project, not placeholder text. Keep one visual style across all screens.', '',
    '## The product',
    ...(problem ? [`Problem: ${problem.replace(/\s+/g, ' ')}`] : []),
    ...(who ? [`First user: ${who.replace(/\s+/g, ' ')}`] : []),
    ...(choice('form') ? [`Form: ${choice('form')}`] : []),
    ...(choice('language-and-framework') ? [`Stack: ${choice('language-and-framework')}`] : []), '',
    '## Requirements (keep the IDs)',
    ...Object.entries(requirements).map(([id, s]) => `- ${id} ${s}`), '',
    '## Screens',
    ...screens.map((s) => `${s.number} · ${s.name}: ${s.shows} (${s.reqs.join(', ')})`), '',
    '## Rules',
    `- Follow the UI standard: ${uiStandard}.`,
    states.length ? `- Show the locked and empty states the scenarios describe: ${states.join('; ')}.` : '- Show locked and empty states where a screen can have them.',
    '- One screen per artboard; link the screens the way a user moves between them.', '',
    '## When you export',
    `Name each file: spec-v${version} · <number> · <screen> · <REQ IDs>.png`,
    'Export the HTML source of each screen too, with the same name.', '',
  ];
  return { specVersion: version, title, screens, text: lines.join('\n'), fileName: `keel-mock-prompt-spec-v${version}.md` };
}
