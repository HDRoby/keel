// Design options for the spec (REQ-013, task R12): one model call proposes, for each decision topic, two or three
// options with a summary, an advantage, a drawback, the requirements they serve, a fit line against the standards
// and constraints, and one recommended. The answer is validated; a topic the assistant adds must name the
// requirement that needs it. When the folder has code, "Keep current" is offered first for the stack.
import { z } from 'zod';
import { chosenOption, optionSchema, topicId, type DesignOption, type Topic } from '../decisions/design';
import type { RepoFacts } from '../repo/facts';
import type { Standard } from '../standards/library';
import type { Writer } from './writer';

/** In the system prompt; the fake provider looks for it to answer with topics. */
export const DESIGN_MARKER = 'Answer with the design topics as JSON and nothing else.';
const STACK_TOPIC = 'Language and framework';

const answerSchema = z.object({
  topics: z.array(z.object({
    title: z.string().min(1).max(120),
    reason_added: z.string().max(300).optional(),
    options: z.array(optionSchema.omit({ id: true })).min(1).max(6),
  })).max(20),
});

export interface DesignInput {
  requirements: Record<string, string>;
  constraints: string;
  standards: Standard[];
  facts: RepoFacts;
  topics: { title: string; guidance: string }[];
}

export function designMessages(input: DesignInput) {
  return [
    {
      role: 'system' as const,
      content: [
        'You propose design options for a spec. For each topic give two or three concrete, comparable options, each with a one-line summary, one advantage (pro), one drawback (con), the requirement IDs it serves, and a fit line: which standard or constraint it follows, breaks or conflicts with, or a concern it adds.',
        'Mark exactly one option per topic as recommended and say why in "reason". If the code in the folder already decides a topic, offer "Keep current: <stack>" first.',
        'You may add a topic only when a requirement needs one; say which in "reason_added" (for example "Added for REQ-007").',
        DESIGN_MARKER,
        'Format: {"topics": [{"title": "...", "reason_added"?: "...", "options": [{"name": "...", "summary": "...", "pro": "...", "con": "...", "serves": ["REQ-001"], "fit": {"kind": "follows" | "breaks" | "conflicts" | "adds-concern", "text": "..."}, "recommended": true, "reason": "..."}]}]}',
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        requirements: input.requirements, constraints: input.constraints,
        standards: input.standards.map((s) => ({ ref: s.ref, name: s.name, description: s.description })),
        code: input.facts, topics: input.topics,
      }),
    },
  ];
}

/** Exactly one recommended option (the first one marked, else the first), at most three options. */
function tidy(options: Omit<DesignOption, 'id'>[], topic: string): DesignOption[] {
  const three = options.slice(0, 3);
  const pick = Math.max(0, three.findIndex((o) => o.recommended));
  return three.map((o, i) => ({ ...o, id: `${topicId(topic)}-${i + 1}`, recommended: i === pick }));
}

/** "Keep current: <stack>" first for the stack topic when the folder has code. */
function keepCurrent(options: DesignOption[], facts: RepoFacts, topic: string): DesignOption[] {
  if (!facts.stack || topic !== STACK_TOPIC) return options;
  const existing = options.find((o) => o.name.toLowerCase().startsWith('keep current'));
  const keep: DesignOption = existing ?? {
    id: '', name: `Keep current: ${facts.stack}`, summary: `The code in the folder already uses ${facts.stack} (${facts.manifests.join(', ')}).`,
    pro: 'No rewrite; the coding agent builds on what is there.', con: 'Inherits the current stack\'s limits.', serves: [], recommended: false,
    fit: { kind: 'follows', text: `Matches the code in the folder (${facts.manifests.join(', ')})` },
  };
  const rest = options.filter((o) => o !== existing).slice(0, 2);
  return [keep, ...rest].map((o, i) => ({ ...o, id: `${topicId(topic)}-${i + 1}` }));
}

/**
 * Topics with their proposed options. Without a model (or with an answer that is not valid), the template's topics
 * come back with no options, and the user writes their own.
 */
export async function proposeDecisions(input: DesignInput, write: Writer): Promise<Topic[]> {
  const base: Topic[] = input.topics.map((t) => ({ id: topicId(t.title), title: t.title, guidance: t.guidance, origin: 'template', options: [] }));
  if (base.length === 0) return [];
  const text = await write('documents', designMessages(input));
  let answer: z.infer<typeof answerSchema> | undefined;
  try {
    const parsed = text ? answerSchema.safeParse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))) : undefined;
    answer = parsed?.success ? parsed.data : undefined;
  } catch {
    answer = undefined;
  }
  const topics = base.map((t) => {
    const given = answer?.topics.find((a) => a.title.toLowerCase() === t.title.toLowerCase());
    const options = given ? tidy(given.options, t.title) : [];
    return { ...t, options: keepCurrent(options, input.facts, t.title) };
  });
  // Topics the assistant added must say which requirement needs them.
  for (const extra of answer?.topics ?? []) {
    if (base.some((t) => t.title.toLowerCase() === extra.title.toLowerCase())) continue;
    if (!extra.reason_added || !/REQ-\d{3,}/.test(extra.reason_added)) continue;
    topics.push({ id: topicId(extra.title), title: extra.title, guidance: '', origin: 'assistant', reasonAdded: extra.reason_added, options: tidy(extra.options, extra.title) });
  }
  return topics;
}

/** Keeps the choices already made when topics are proposed again (regenerate): only undecided topics change. */
export function mergeTopics(current: Topic[], proposed: Topic[]): Topic[] {
  const kept = current.filter((t) => chosenOption(t));
  return [...kept, ...proposed.filter((p) => !kept.some((k) => k.id === p.id))];
}
