// Renders a template into a document body by filling {{placeholders}} (REQ-003).
import matter from 'gray-matter';

export interface Rendered {
  body: string;
  missing: string[];   // placeholders with no value, left in place
}

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

/** Names of the placeholders in a template body, in order of first use. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ''))];
}

/** Drops the template's front matter and fills placeholders. Section guidance comments stay. */
export function renderTemplate(content: string, values: Record<string, string>): Rendered {
  const body = matter(content, {}).content.replace(/^\n/, '');
  const missing: string[] = [];
  const filled = body.replace(PLACEHOLDER, (whole, name: string) => {
    const value = values[name];
    if (value !== undefined) return value;
    if (!missing.includes(name)) missing.push(name);
    return whole;
  });
  return { body: filled, missing };
}
