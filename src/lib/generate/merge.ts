// Three-way merge for regenerated documents (owner decision, T6). Per section of a document, or per
// whole file: what Keel generated last time (base), the file now (mine), and the new generation (theirs).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface Conflict {
  kind: 'section' | 'file';
  name: string;          // section heading, or a repository path
  mine: string;          // empty when the proposer removed it
  theirs: string;        // empty when the new generation removes it
  title?: string;        // task conflicts: the regenerated task's title and requirements
  requirements?: string[];
}

export interface Section {
  heading: string;
  text: string;
}

/** Splits markdown at "## " headings: the text before the first one, then each section's text. */
export function splitSections(body: string): { head: string; sections: Section[] } {
  const parts = body.split(/^## /m);
  const head = parts.shift() ?? '';
  return {
    head,
    sections: parts.map((part) => {
      const newline = part.indexOf('\n');
      return newline < 0 ? { heading: part.trim(), text: '' } : { heading: part.slice(0, newline).trim(), text: part.slice(newline + 1) };
    }),
  };
}

export function joinSections(head: string, sections: Section[]): string {
  return head + sections.map((s) => `## ${s.heading}\n${s.text}`).join('');
}

const same = (a: string | undefined, b: string | undefined) => (a ?? '').trim() === (b ?? '').trim();

/**
 * Merges one piece. Only one side changed: that side wins. Both changed the same way: no conflict.
 * Both changed differently: a conflict, and mine stays until it is resolved.
 */
export function mergePiece(base: string | undefined, mine: string | undefined, theirs: string | undefined): { value: string | undefined; conflict: boolean } {
  if (same(mine, theirs)) return { value: mine, conflict: false };
  if (same(mine, base)) return { value: theirs, conflict: false };
  if (same(theirs, base)) return { value: mine, conflict: false };
  return { value: mine, conflict: true };
}

/** Merges a document section by section, keeping the order of mine and adding new sections where the generation puts them. */
export function mergeSections(base: string, mine: string, theirs: string): { body: string; conflicts: Conflict[] } {
  const b = splitSections(base);
  const m = splitSections(mine);
  const t = splitSections(theirs);
  const find = (list: Section[], heading: string) => list.find((s) => s.heading === heading)?.text;
  const conflicts: Conflict[] = [];
  const merged: Section[] = [];
  const headings = m.sections.map((s) => s.heading);
  t.sections.forEach((s, i) => {
    if (headings.includes(s.heading) || find(b.sections, s.heading) !== undefined) return;
    const before = t.sections[i - 1]?.heading;
    const at = before ? headings.indexOf(before) + 1 : 0;
    headings.splice(at > 0 ? at : headings.length, 0, s.heading);
  });
  for (const heading of headings) {
    const piece = mergePiece(find(b.sections, heading), find(m.sections, heading), find(t.sections, heading));
    if (piece.conflict) conflicts.push({ kind: 'section', name: heading, mine: find(m.sections, heading) ?? '', theirs: find(t.sections, heading) ?? '' });
    if (piece.value !== undefined) merged.push({ heading, text: piece.value });
  }
  // A section the proposer removed and the generation changed is a conflict too.
  for (const s of b.sections) {
    const theirsText = find(t.sections, s.heading);
    if (!headings.includes(s.heading) && theirsText !== undefined && !same(s.text, theirsText)) {
      conflicts.push({ kind: 'section', name: s.heading, mine: '', theirs: theirsText });
    }
  }
  const head = mergePiece(b.head, m.head, t.head).value ?? m.head;
  return { body: joinSections(head, merged), conflicts };
}

/** The end of a regeneration's version reason, such as ", 2 conflicts to resolve"; empty without conflicts. */
export function conflictNote(conflicts: Conflict[]): string {
  return conflicts.length ? `, ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} to resolve` : '';
}

/** Replaces (or removes, when text is empty) one section of a document. */
export function setSection(body: string, heading: string, text: string): string {
  const { head, sections } = splitSections(body);
  const rest = text.trim() ? sections.map((s) => (s.heading === heading ? { heading, text: `\n${text.trim()}\n\n` } : s)) : sections.filter((s) => s.heading !== heading);
  const added = text.trim() && !sections.some((s) => s.heading === heading) ? [{ heading, text: `\n${text.trim()}\n` }] : [];
  return joinSections(head, [...rest, ...added]);
}

/** Where Keel keeps what it generated last, so the next generation can be merged: .keel/generated/<path>. */
export function baselinePath(dir: string, path: string): string {
  return join(dir, '.keel', 'generated', path);
}

export function readBaseline(dir: string, path: string): string | undefined {
  const file = baselinePath(dir, path);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

export function writeBaseline(dir: string, path: string, content: string | undefined): string {
  const file = baselinePath(dir, path);
  if (content === undefined) {
    rmSync(file, { force: true });
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return join('.keel', 'generated', path);
}
