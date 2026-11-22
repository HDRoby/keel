// Matching exported mock files to screens by name (REQ-010, task R14). Pure functions with no file system access,
// so the Spec page can preview the matching in the browser before anything is sent. Files are never sent to a model.

/** The export name the prompt asks for: "spec-v<N> · <number> · <screen> · <REQ IDs>.<png|html>". */
export const MOCK_NAME = /^spec-v(\d+)\s*·\s*(\d{1,3})\s*·\s*(.+?)(?:\s*·\s*(REQ-\d{3,}(?:\s*,\s*REQ-\d{3,})*))?\.(png|html?)$/i;

export interface ParsedName { specVersion: number; number: string; screen: string; reqs: string[]; ext: 'png' | 'html' }

export function parseMockName(name: string): ParsedName | undefined {
  const m = MOCK_NAME.exec(name.normalize('NFC').trim());
  if (!m) return undefined;
  return {
    specVersion: Number(m[1]), number: (m[2] ?? '').padStart(2, '0'), screen: (m[3] ?? '').trim(),
    reqs: (m[4] ?? '').split(',').map((r) => r.trim()).filter(Boolean), ext: (m[5] ?? '').toLowerCase().startsWith('htm') ? 'html' : 'png',
  };
}

export interface Screen { number: string; name: string; shows: string; reqs: string[] }

/** How a file was matched: from its name, from its name but with something to check, or not at all. */
export type Match = 'name' | 'check' | 'none';

export interface MatchedFile {
  key: string;                // the base name; a PNG and an HTML with the same base name are one screen
  files: string[];            // the file names, PNG first
  screen?: string;
  number?: string;
  reqs: string[];
  match: Match;
  note: string;               // "From the file name", "Check: no REQ in name", "Choose a screen"
}

const base = (name: string) => name.replace(/\.(png|html?)$/i, '');

/**
 * Groups the files by base name and matches each group to a screen. A name without requirement IDs takes them from
 * the screen with the same name when there is one, and is marked to check.
 */
export function matchFiles(names: string[], screens: Screen[]): MatchedFile[] {
  const groups = new Map<string, string[]>();
  for (const name of names) groups.set(base(name), [...(groups.get(base(name)) ?? []), name]);
  return [...groups.entries()].map(([key, files]) => {
    const sorted = [...files].sort((a, b) => Number(/\.html?$/i.test(a)) - Number(/\.html?$/i.test(b)));
    const parsed = parseMockName(sorted[0] ?? '');
    if (!parsed) return { key, files: sorted, reqs: [], match: 'none' as const, note: 'Choose a screen' };
    const known = screens.find((s) => s.name.toLowerCase() === parsed.screen.toLowerCase() || s.number === parsed.number);
    if (parsed.reqs.length) return { key, files: sorted, screen: parsed.screen, number: parsed.number, reqs: parsed.reqs, match: 'name' as const, note: 'From the file name' };
    return { key, files: sorted, screen: parsed.screen, number: parsed.number, reqs: known?.reqs ?? [], match: 'check' as const, note: 'Check: no REQ in name' };
  });
}
