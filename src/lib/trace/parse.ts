// Finds requirement IDs in documents, task files and @REQ tags in feature files (REQ-004).
import matter from 'gray-matter';

const REQ = /\bREQ-\d{3,}\b/g;

export interface TaskTrace {
  id: string;
  title: string;
  requirements: string[];
  features: string[];   // feature files named in the task
}

export interface ScenarioTrace {
  feature: string;      // path, e.g. features/templates.feature
  scenario: string;
  requirements: string[];
}

/** Every REQ ID in a text, once, in order of first use. */
export function reqIds(text: string): string[] {
  return [...new Set(text.match(REQ) ?? [])];
}

/** The highest REQ number in a text, or 0. */
export function maxReqNumber(text: string): number {
  return Math.max(0, ...reqIds(text).map((id) => Number(id.slice(4))));
}

/**
 * Requirement statements by ID, from list items ("- REQ-001 Text", "- REQ-001: Text")
 * and table rows ("| REQ-001 | Text | ... |").
 */
export function requirementStatements(markdown: string): Record<string, string> {
  const statements: Record<string, string> = {};
  for (const line of markdown.split('\n')) {
    const item = /^\s*(?:[-*]|\d+\.)\s+(REQ-\d{3,})\b[\s:·—-]*(.*)$/.exec(line);
    const row = /^\s*\|\s*(REQ-\d{3,})\s*\|\s*([^|]*)\|/.exec(line);
    const [, id, text] = item ?? row ?? [];
    if (id && !(id in statements)) statements[id] = (text ?? '').trim();
  }
  return statements;
}

/** A task file: id and requirements from front matter (or the body), and the feature files it names. */
export function parseTask(path: string, content: string): TaskTrace {
  let data: Record<string, unknown> = {};
  let body = content;
  try {
    ({ data, content: body } = matter(content, {}));
  } catch {
    // Broken front matter: fall back to the text.
  }
  const fileId = /([^/]+)\.md$/.exec(path)?.[1] ?? path;
  const id = typeof data.id === 'string' ? data.id : fileId;
  const fromHeader = Array.isArray(data.requirements) ? data.requirements.filter((r): r is string => typeof r === 'string') : [];
  const heading = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? '';
  const title = heading.replace(new RegExp(`^${id}\\s*[·:—-]\\s*`), '');
  return {
    id,
    title: title || (typeof data.title === 'string' ? data.title : ''),
    requirements: fromHeader.length > 0 ? fromHeader : reqIds(body),
    features: [...new Set(body.match(/features\/[\w./-]+\.feature/g) ?? [])],
  };
}

/** Scenarios in a feature file with the REQ tags on them, including tags on the feature. */
export function parseFeature(path: string, content: string): ScenarioTrace[] {
  const scenarios: ScenarioTrace[] = [];
  let featureTags: string[] = [];
  let pending: string[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('@')) {
      pending.push(...reqIds(line));
    } else if (/^Feature:/.test(line)) {
      featureTags = pending;
      pending = [];
    } else if (/^Scenario( Outline)?:/.test(line)) {
      scenarios.push({ feature: path, scenario: line.replace(/^Scenario( Outline)?:\s*/, ''), requirements: [...new Set([...featureTags, ...pending])] });
      pending = [];
    }
  }
  return scenarios;
}

/** "features/x.feature › Scenario name", as in traceability.json. */
export function scenarioLabel(s: { feature: string; scenario: string }): string {
  return `${s.feature} › ${s.scenario}`;
}
