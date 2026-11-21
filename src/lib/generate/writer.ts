// Writes a piece of a document with the model chosen for the task (REQ-009). Undefined when no model answers.
import { providerForTask } from '../providers/registry';
import type { ChatMessage, ModelTask } from '../providers/types';
import type { Store } from '../store/db';

export type Writer = (task: ModelTask, messages: ChatMessage[]) => Promise<string | undefined>;

/** A Writer backed by Settings › Model per task. Message content is never logged. */
export function providerWriter(store: Store, env: Record<string, string | undefined> = process.env): Writer {
  return async (task, messages) => {
    const resolved = providerForTask(store, task, env);
    if (!resolved.ok) return undefined;
    try {
      let text = '';
      for await (const chunk of resolved.value.provider.stream(messages, { model: resolved.value.choice.model })) text += chunk;
      return text.trim() || undefined;
    } catch {
      return undefined;
    }
  };
}

export interface SectionRequest {
  kind: string;          // e.g. spec, implementation plan
  title: string;
  heading: string;
  guidance: string;
  sources: string;
}

/** Messages asking for one section of a document, as plain markdown without headings. */
export function sectionPrompt(input: SectionRequest): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You write the "${input.heading}" section of the ${input.kind} for the project "${input.title}".`
        + `${input.guidance ? ` ${input.guidance}` : ''} Write plain markdown without headings.`
        + ' Use only the requirement IDs that appear in the sources; never invent new ones.',
    },
    { role: 'user', content: input.sources },
  ];
}

export function notWritten(heading: string, guidance: string): string {
  return `_Not written yet: ${(guidance || heading).replace(/\.$/, '')}. No model was available._`;
}

/**
 * Model text as the body of one section: level 1 and 2 headings become level 3, so a reply that
 * ignores "no headings" cannot split the document's sections (or the three-way merge).
 */
export function asSectionBody(text: string): string {
  return text.replace(/^#{1,2}[ \t]+/gm, '### ').trim();
}

/** One section written by the model for the task, or the "Not written yet" note when no model answers. */
export async function writeSection(write: Writer, task: ModelTask, request: SectionRequest): Promise<string> {
  const written = await write(task, sectionPrompt(request));
  return written ? asSectionBody(written) : notWritten(request.heading, request.guidance);
}
