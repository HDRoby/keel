// The user's own design option, reviewed against the requirements and standards when they decide (REQ-013, R12):
// the model returns a fit line. Without a model the option is kept without one.
import { z } from 'zod';
import type { Store } from '../store/store';
import { readDocument } from '../store/documents';
import { readProject } from '../store/workspace';
import { standardsFor } from '../standards/library';
import { requirementStatements } from '../trace/parse';
import type { Writer } from '../generate/writer';
import type { Fit, Topic } from './design';

export const OWN_MARKER = 'Answer with a fit line as JSON and nothing else.';
const fitSchema = z.object({ kind: z.enum(['follows', 'breaks', 'conflicts', 'adds-concern']), text: z.string().min(1).max(500) });

export async function reviewOwnOption(store: Store, topic: Topic, own: { name: string; summary: string }, write: Writer): Promise<Fit | undefined> {
  const spec = readDocument(store, 'docs/spec.md');
  const project = readProject(store.root);
  const standards = standardsFor(store.root, project.ok ? project.value.standards : []);
  const text = await write('documents', [
    { role: 'system', content: `Review the user's own option for the design topic "${topic.title}" against the requirements and standards. Say in one line which standard or constraint it follows, breaks or conflicts with, or which concern it adds.\n${OWN_MARKER}\nFormat: {"kind": "follows" | "breaks" | "conflicts" | "adds-concern", "text": "..."}` },
    { role: 'user', content: JSON.stringify({ option: own, requirements: spec.ok ? requirementStatements(spec.value.body) : {}, standards: standards.map((s) => ({ ref: s.ref, name: s.name, description: s.description })) }) },
  ]);
  try {
    const parsed = text ? fitSchema.safeParse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))) : undefined;
    return parsed?.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
