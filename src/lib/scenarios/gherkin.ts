// Acceptance scenarios as data and back (REQ-004, task R11): a .feature file parsed into its feature, background
// and scenarios, and built again. What Keel does not edit (the feature description, a Background, tables and doc
// strings under a step, Examples of an outline, other tags) is kept as written, so editing one scenario does not
// reformat the rest of the file.

export const KEYWORDS = ['Given', 'When', 'Then', 'And', 'But'] as const;
export type Keyword = (typeof KEYWORDS)[number];

export interface Step {
  keyword: Keyword;
  text: string;
  extra?: string[];        // table rows or a doc string under the step, without their indentation
}

export interface Scenario {
  tags: string[];          // e.g. ['@REQ-001', '@smoke']
  name: string;
  steps: Step[];
  outline?: boolean;       // Scenario Outline
  examples?: string[];     // the Examples block, as written
}

export interface FeatureDoc {
  tags: string[];
  name: string;
  description: string[];
  background?: string[];   // the Background block, as written
  scenarios: Scenario[];
}

const STEP = /^(Given|When|Then|And|But|\*)\s+(.*)$/;

/** Parses a .feature file. Lines it does not understand stay with the block they belong to. */
export function parseFeatureDoc(text: string): FeatureDoc {
  const doc: FeatureDoc = { tags: [], name: '', description: [], scenarios: [] };
  let tags: string[] = [];
  let section: 'head' | 'description' | 'background' | 'scenario' | 'examples' = 'head';
  let scenario: Scenario | undefined;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('@')) {
      tags.push(...line.split(/\s+/).filter((t) => t.startsWith('@')));
      continue;
    }
    const feature = /^Feature:\s*(.*)$/.exec(line);
    if (feature) {
      doc.name = feature[1] ?? '';
      doc.tags = tags;
      tags = [];
      section = 'description';
      continue;
    }
    if (/^Background:/.test(line)) {
      doc.background = [line];
      section = 'background';
      continue;
    }
    const start = /^Scenario( Outline)?:\s*(.*)$/.exec(line);
    if (start) {
      scenario = { tags, name: start[2] ?? '', steps: [], ...(start[1] ? { outline: true } : {}) };
      doc.scenarios.push(scenario);
      tags = [];
      section = 'scenario';
      continue;
    }
    if (section === 'description') {
      if (line || doc.description.length) doc.description.push(line);
      continue;
    }
    if (section === 'background') {
      if (line) doc.background?.push(line);
      continue;
    }
    if (!scenario || !line) continue;
    if (/^Examples:/.test(line) || section === 'examples') {
      section = 'examples';
      scenario.examples = [...(scenario.examples ?? []), line];
      continue;
    }
    const step = STEP.exec(line);
    if (step) {
      scenario.steps.push({ keyword: step[1] === '*' ? 'And' : (step[1] as Keyword), text: step[2] ?? '' });
    } else {
      const last = scenario.steps.at(-1);
      if (last) last.extra = [...(last.extra ?? []), line];
    }
  }
  while (doc.description.at(-1) === '') doc.description.pop();
  return doc;
}

/** Builds the .feature text: two spaces per level, a blank line between scenarios. */
export function buildFeature(doc: FeatureDoc): string {
  const out: string[] = [];
  if (doc.tags.length) out.push(doc.tags.join(' '));
  out.push(`Feature: ${doc.name}`);
  if (doc.description.length) out.push('', ...doc.description.map((l) => (l ? `  ${l}` : '')));
  if (doc.background?.length) out.push('', ...doc.background.map((l, i) => (i === 0 ? `  ${l}` : `    ${l}`)));
  for (const s of doc.scenarios) {
    out.push('');
    if (s.tags.length) out.push(`  ${s.tags.join(' ')}`);
    out.push(`  Scenario${s.outline ? ' Outline' : ''}: ${s.name}`);
    for (const step of s.steps) {
      out.push(`    ${step.keyword} ${step.text}`);
      (step.extra ?? []).forEach((l) => out.push(`      ${l}`));
    }
    if (s.examples?.length) out.push('', ...s.examples.map((l, i) => (i === 0 ? `    ${l}` : `      ${l}`)));
  }
  return `${out.join('\n')}\n`;
}

/** REQ IDs tagged on a scenario (and on its feature). */
export function requirementsOf(scenario: Pick<Scenario, 'tags'>, feature: Pick<FeatureDoc, 'tags'> = { tags: [] }): string[] {
  return [...new Set([...feature.tags, ...scenario.tags].map((t) => /^@(REQ-\d{3,})$/.exec(t)?.[1]).filter((t): t is string => Boolean(t)))];
}

/** A soft warning, not a block (BDD style): a scenario should say what it proves. */
export function warnings(scenario: Pick<Scenario, 'steps'>): string[] {
  const kinds = new Set(scenario.steps.map((s) => s.keyword));
  return [
    ...(kinds.has('Then') ? [] : ['No Then step: say what the scenario proves.']),
    ...(scenario.steps.filter((s) => s.keyword === 'When').length > 1 ? ['More than one When: one behaviour per scenario where possible.'] : []),
  ];
}
