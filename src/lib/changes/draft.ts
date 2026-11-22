// The assistant's draft of a new change request (REQ-015, CR-0013): Why, What changes and Done when, from the title,
// the reason and the source document. One model call, validated; without a model the sections stay to be written.
import { z } from 'zod';
import type { Writer } from '../generate/writer';
import type { ChangeDraft } from './body';

/** In the system prompt; the fake provider looks for it. */
export const CHANGE_DRAFT_MARKER = 'Answer with the change request sections as JSON and nothing else.';

const answerSchema = z.object({ why: z.string().max(3000).default(''), what_changes: z.string().max(5000).default(''), done_when: z.string().max(3000).default('') });

export async function draftChange(write: Writer, input: { title: string; reason: string; source?: string; requirements: string[] }): Promise<ChangeDraft> {
  const text = await write('documents', [
    {
      role: 'system',
      content: [
        'You draft a change request for a software project. Why: the problem with things as they are, in plain words. What changes: the behaviour after the change as numbered steps a person would see, naming screens, buttons and messages. Done when: a short list of checks a person can run.',
        'Write plainly and briefly. Do not invent requirements.',
        CHANGE_DRAFT_MARKER,
        'Format: {"why": "...", "what_changes": "1. ...", "done_when": "- ..."}',
      ].join('\n'),
    },
    { role: 'user', content: JSON.stringify(input) },
  ]);
  try {
    const parsed = text ? answerSchema.safeParse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))) : undefined;
    return parsed?.success ? { why: parsed.data.why, whatChanges: parsed.data.what_changes, doneWhen: parsed.data.done_when } : {};
  } catch {
    return {};
  }
}
