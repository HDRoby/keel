// The baseline of an existing project (REQ-012, CR-0010): "record what exists, then plan the next change". From the
// files the user chose to share (and only those), one model call suggests the intent's sections and the requirements
// as built. Without consent, no model call: only the requirements from existing specs and the current stack.
// Everything is a suggestion in Explore that the user accepts, edits or clears.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { readExplore, writeExplore } from '../brainstorm/session';
import type { Writer } from '../generate/writer';
import { readShared, type ShareableFile } from '../repo/scan';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { commitFiles } from '../store/git';
import { importSpecs } from './import-specs';

/** In the system prompt; the fake provider looks for it. */
export const BASELINE_MARKER = 'Answer with the baseline as JSON and nothing else.';
export const BASELINE_FILE = '.keel/baseline.json';
const MAX_TOTAL = 200 * 1024;

const answerSchema = z.object({
  sections: z.record(z.string(), z.string().max(4000)).default({}),
  requirements: z.array(z.string().min(3).max(300)).max(60).default([]),
});

export interface Baseline { stack?: string; sent: string[]; sections: Record<string, string>; requirements: string[] }

export function baselineMessages(sections: string[], files: { path: string; text: string }[]) {
  return [
    {
      role: 'system' as const,
      content: [
        'You record what an existing software project already is, from the files given. Fill the intent sections listed, briefly and factually, as the project stands today.',
        'List the requirements the code already meets, one short, testable statement each. Do not invent features that the files do not show.',
        BASELINE_MARKER,
        'Format: {"sections": {"<section>": "..."}, "requirements": ["..."]}',
      ].join('\n'),
    },
    { role: 'user' as const, content: JSON.stringify({ sections, files }) },
  ];
}

/**
 * Drafts the baseline into Explore as suggestions: empty text sections get suggested text, and requirements are added
 * as suggested rows marked "(as built)". Saves .keel/baseline.json (the stack and what was sent) in one commit.
 */
export async function draftBaseline(store: Store, input: { share: string[]; offered: ShareableFile[]; stack?: string }, write: Writer): Promise<Result<Baseline, 'not-found' | 'failed'>> {
  const explore = readExplore(store);
  if (!explore.ok) return fail('not-found', explore.message);
  const files = readShared(store.root, input.share, input.offered);
  let total = 0;
  const sent = files.filter((f) => (total += f.text.length) <= MAX_TOTAL);
  const textSections = explore.value.sections.filter((s) => !s.rows).map((s) => s.key);
  let answer: z.infer<typeof answerSchema> = { sections: {}, requirements: [] };
  if (sent.length > 0) {
    const text = await write('documents', baselineMessages(textSections, sent));
    try {
      const parsed = text ? answerSchema.safeParse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))) : undefined;
      if (parsed?.success) answer = parsed.data;
    } catch {
      /* no usable answer: the user fills the sections */
    }
  }
  const imported = importSpecs(store.root).map((r) => `${r.text} (as built; ${r.alias} in ${r.source})`);
  const requirements = [...answer.requirements.map((r) => `${r.replace(/\s*\(as built\)\s*$/i, '')} (as built)`), ...imported];
  const sections = Object.fromEntries(Object.entries(answer.sections).filter(([k, v]) => textSections.includes(k) && v.trim()));
  const state = {
    ...explore.value,
    sections: explore.value.sections.map((s) => {
      if (s.rows) return requirements.length ? { ...s, rows: [...s.rows, ...requirements.map((text) => ({ text, origin: 'suggested' as const }))] } : s;
      const suggestion = sections[s.key];
      return suggestion && !s.value.trim() ? { ...s, value: suggestion, origin: 'suggested' as const } : s;
    }),
  };
  writeExplore(store, state);
  const baseline: Baseline = { ...(input.stack ? { stack: input.stack } : {}), sent: sent.map((f) => f.path), sections, requirements };
  writeFileSync(join(store.root, BASELINE_FILE), `${JSON.stringify(baseline, null, 2)}\n`);
  await commitFiles(store.root, ['.keel'], `Keel: Baseline drafted from ${sent.length} file${sent.length === 1 ? '' : 's'}`);
  return ok(baseline);
}
