// The assistant's review of Explore (REQ-001, task R10): one model call reads every section, the template and
// the style, and returns a comment per section, suggestions for empty sections, and for a reply, an answer in
// that section's thread. The answer is validated; unknown sections are ignored. Suggestions go only into empty
// sections the user has not cleared, and never into text the user wrote.
import { z } from 'zod';
import type { ChatMessage, ChatProvider } from '../providers/types';
import { fail, ok, type Result } from '../result';
import { counts, fingerprint, sectionOf, type Comment, type Context, type Explore, type SectionState } from './session';

/** Says in the system prompt that the answer is JSON; the fake provider looks for it to answer in kind. */
export const REVIEW_MARKER = 'Answer with one JSON object and nothing else.';

const commentAnswer = z.object({
  kind: z.enum(['challenge', 'link', 'suggest', 'ask', 'ok']),
  text: z.string().min(1).max(2_000),
  linkTo: z.string().max(200).optional(),
  rewrite: z.string().max(20_000).optional(),
  addRow: z.string().max(2_000).optional(),
});
const answerSchema = z.object({
  comments: z.record(z.string(), commentAnswer).default({}),
  suggestions: z.record(z.string(), z.union([z.string().max(20_000), z.array(z.string().max(2_000)).max(30)])).default({}),
  reply: z.object({ text: z.string().min(1).max(4_000), rewrite: z.string().max(20_000).optional() }).optional(),
});
export type ReviewAnswer = z.infer<typeof answerSchema>;

export type ReviewError = 'no-change' | 'model-failed' | 'invalid-answer' | 'unknown-section' | 'aborted';

/** What the model sees of a section. Suggestions are marked so the model does not take them as the user's. */
function sectionView(context: Context, section: SectionState) {
  const template = context.sections.find((s) => s.heading === section.key);
  return {
    section: section.key,
    required: template?.required ?? false,
    guidance: template?.guidance ?? '',
    ...(section.rows
      ? { rows: section.rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), text: r.text, by: r.origin === 'suggested' ? 'assistant (not accepted)' : 'user' })) }
      : { text: section.value, by: section.origin === 'suggested' ? 'assistant (not accepted)' : 'user' }),
    ...(section.cleared ? { cleared: true } : {}),
    ...(section.thread.length ? { thread: section.thread.slice(-6).map((t) => ({ from: t.from, text: t.text })) } : {}),
  };
}

/** The prompt: the style as instructions, the rules, and every section with its value as JSON. */
export function reviewMessages(context: Context, reply?: { key: string; text: string }): ChatMessage[] {
  const sections = context.sections.map((s) => sectionView(context, sectionOf(context.state, s.heading, s.list)));
  const system = [
    context.style.instructions,
    '',
    `You review the sections of an intent for the idea "${context.state.title}". Read all of them together.`,
    'For every section write one short comment of one kind: "challenge" (question it and say why), "link" (it conflicts with or depends on another section; name it in linkTo), "suggest" or "ask" (for an empty or thin section), or "ok" (looks good).',
    'Never change the user\'s text. You may offer a full replacement text for a section in "rewrite", which the user can apply. For the Requirements section you may offer one new row in "addRow".',
    'For an empty section that is not cleared you may put a suggestion in "suggestions" (for Requirements, a list of rows). Do not suggest for sections the user wrote or cleared.',
    ...(reply ? [`The user replied in the thread of "${reply.key}". Answer them in "reply" (with an optional "rewrite"), then comment on every section again.`] : []),
    '',
    REVIEW_MARKER,
    'Format: {"comments": {"<section>": {"kind": "...", "text": "...", "linkTo"?: "...", "rewrite"?: "...", "addRow"?: "..."}}, "suggestions": {"<section>": "..." | ["..."]}, "reply"?: {"text": "...", "rewrite"?: "..."}}',
  ].join('\n');
  const user = JSON.stringify({ title: context.state.title, idea: context.state.idea, sections, ...(reply ? { replyTo: reply } : {}) }, null, 1);
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Reads the model's answer: the first JSON object in it, validated. */
export function parseAnswer(text: string): Result<ReviewAnswer, 'invalid-answer'> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return fail('invalid-answer', 'The assistant did not answer with a review');
  try {
    const parsed = answerSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? ok(parsed.data) : fail('invalid-answer', 'The assistant\'s review was not in the expected form');
  } catch {
    return fail('invalid-answer', 'The assistant\'s review was not valid JSON');
  }
}

/**
 * Puts a review into the state: a comment on every known section (a comment whose text changed gets a new
 * time, for the "New comment" tag), suggestions only into empty sections that are not cleared, never into the
 * user's text, and each section's fingerprint so an unchanged list is not reviewed again.
 */
export function applyAnswer(context: Context, answer: ReviewAnswer, now: string, reply?: { key: string; text: string }, reviewed?: Record<string, string>): Explore {
  const state = structuredClone(context.state);
  for (const template of context.sections) {
    const at = state.sections.findIndex((s) => s.key === template.heading);
    const section: SectionState = at >= 0 ? state.sections[at] as SectionState : sectionOf(state, template.heading, template.list);
    const suggestion = answer.suggestions[template.heading];
    let suggested = false;
    if (suggestion !== undefined && !section.cleared) {
      if (template.list) {
        const rows = (Array.isArray(suggestion) ? suggestion : suggestion.split('\n')).map((r) => r.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
        if ((section.rows ?? []).length === 0 && rows.length) {
          section.rows = rows.map((text) => ({ text, origin: 'suggested' as const }));
          suggested = true;
        }
      } else if (section.value.trim() === '' && typeof suggestion === 'string' && suggestion.trim()) {
        section.value = suggestion.trim();
        section.origin = 'suggested';
        suggested = true;
      }
    }
    const given = answer.comments[template.heading];
    if (given) {
      const comment: Comment = {
        kind: given.kind, text: given.text,
        ...(given.linkTo && context.sections.some((s) => s.heading === given.linkTo) ? { linkTo: given.linkTo } : {}),
        ...(given.rewrite !== undefined ? { rewrite: given.rewrite } : {}),
        ...(template.list && given.addRow ? { addRow: given.addRow } : {}),
      };
      const changed = !section.comment || section.comment.text !== comment.text || section.comment.kind !== comment.kind;
      section.comment = changed ? comment : { ...comment, ...(section.comment?.dismissed ? { dismissed: true } : {}), ...(section.comment?.applied ? { applied: true } : {}) };
      if (changed) section.commentAt = now;
    }
    if (reply && reply.key === template.heading && answer.reply) {
      section.thread = [...section.thread, { from: 'user', text: reply.text }, { from: 'assistant', text: answer.reply.text, ...(answer.reply.rewrite !== undefined ? { rewrite: answer.reply.rewrite } : {}) }];
      section.commentAt = now;
    }
    // What the assistant saw. A section edited while the review ran keeps its old mark and is reviewed again.
    // The assistant's own suggestion needs no review of its own.
    section.reviewedHash = suggested || !reviewed ? fingerprint(section) : (reviewed[template.heading] ?? section.reviewedHash);
    if (at >= 0) state.sections[at] = section;
    else state.sections.push(section);
  }
  state.reviewedAt = now;
  return state;
}

export interface ReviewOptions {
  model: string;
  signal?: AbortSignal;
  now?: string;
  force?: boolean;                        // review even when nothing changed (a reply)
  log?: (line: string) => void;           // token use, never content
  describeError?: (error: unknown) => string;
}

export interface Review {
  answer: ReviewAnswer;
  reviewed: Record<string, string>;   // each section's fingerprint when the review started
  now: string;
}

/**
 * Reviews every section in one call. Skipped when no section changed since the last review (fingerprints),
 * unless forced. Returns the answer with the fingerprints it saw; apply it with applyAnswer to the latest state,
 * so edits made while the call ran are kept and reviewed next time.
 */
export async function reviewAll(context: Context, provider: ChatProvider, options: ReviewOptions, reply?: { key: string; text: string }): Promise<Result<Review, ReviewError>> {
  if (reply && !context.sections.some((s) => s.heading === reply.key)) return fail('unknown-section', `No section ${reply.key}`);
  const changed = context.sections.some((s) => {
    const section = sectionOf(context.state, s.heading, s.list);
    return section.reviewedHash !== fingerprint(section);
  });
  if (!changed && !options.force && !reply) return fail('no-change', 'Nothing changed since the last review');
  const reviewed = Object.fromEntries(context.sections.map((s) => [s.heading, fingerprint(sectionOf(context.state, s.heading, s.list))]));
  const messages = reviewMessages(context, reply);
  let text = '';
  try {
    for await (const chunk of provider.stream(messages, { model: options.model, maxTokens: 4_000, ...(options.signal ? { signal: options.signal } : {}) })) {
      if (options.signal?.aborted) return fail('aborted', 'The review was cancelled');
      text += chunk;
    }
  } catch (error) {
    if (options.signal?.aborted) return fail('aborted', 'The review was cancelled');
    return fail('model-failed', options.describeError?.(error) ?? (error instanceof Error ? error.message.split('\n')[0] ?? 'The model call failed' : 'The model call failed'));
  }
  // Token use, estimated from characters (about four per token); never the content.
  const sent = messages.reduce((n, m) => n + m.content.length, 0);
  options.log?.(`Explore review: about ${Math.ceil(sent / 4)} tokens in, ${Math.ceil(text.length / 4)} out (${options.model})`);
  const answer = parseAnswer(text);
  if (!answer.ok) return answer;
  return ok({ answer: answer.value, reviewed, now: options.now ?? new Date().toISOString() });
}

/** How many required sections count, for the progress line. */
export function progress(context: Pick<Context, 'state' | 'sections'>): { filled: number; required: number } {
  const required = context.sections.filter((s) => s.required);
  return { filled: required.filter((s) => counts(sectionOf(context.state, s.heading, s.list))).length, required: required.length };
}
