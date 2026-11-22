// One turn of Discuss a change (CR-0016): hold a message that looks like a key; save the user's message; build what
// the assistant sees; summarise the oldest messages when the conversation passes 60% of the model's context.
import type { Writer } from '../generate/writer';
import { effectiveChoice, localModels } from '../providers/local';
import { PROVIDERS, type ChatMessage } from '../providers/types';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/store';
import { readProject } from '../store/workspace';
import { readStyle, DEFAULT_DISCUSSION_STYLE } from '../brainstorm/styles';
import { buildContext, DEFAULT_CONTEXT, estimateTokens, SUMMARY_AT, type Attachment, type ContextBlock, type SourceId } from './context';
import { appendEntries, ASSISTANT, createDiscussion, readDiscussion, stamp, type Discussion } from './file';
import { KEY_HELD, looksLikeKey } from './keys';
import { summaryMessages, systemPrompt, turnMessages } from './prompt';

const KEEP_RECENT = 4;

export async function discussionModel(store: Store): Promise<{ label: string; contextLength: number }> {
  const choice = await effectiveChoice(store, 'discussion');
  const provider = PROVIDERS.find((p) => p.id === choice.provider)?.label ?? choice.provider;
  let contextLength = DEFAULT_CONTEXT;
  if (choice.provider === 'ollama') {
    const local = await localModels(store);
    contextLength = local.models.find((m) => m.name === choice.model)?.contextLength ?? DEFAULT_CONTEXT;
  }
  return { label: choice.model ? `${provider} · ${choice.model}` : provider, contextLength };
}

export function discussionStyle(store: Store): { ref: string; instructions: string } {
  const project = readProject(store.root);
  const ref = project.ok ? project.value.discussionStyle : DEFAULT_DISCUSSION_STYLE;
  const style = readStyle(store.root, ref);
  return { ref, instructions: style.ok ? style.value.instructions : 'You help the owner turn an idea for a change into a change request.' };
}

export interface PreparedTurn {
  discussion: Discussion;
  messages: ChatMessage[];
  context: ContextBlock[];
  tokens: number;
  contextLength: number;
}

const conversationText = (d: Discussion) => d.entries.map((e) => e.text).join('\n');

/** Saves the user's message and returns what to send. A message that looks like a key is refused before anything. */
export async function prepareTurn(store: Store, input: { id?: string; text: string; author: string; sources: SourceId[]; attachments: Attachment[]; model?: { label: string; contextLength: number } }, write: Writer): Promise<Result<PreparedTurn, 'key' | 'not-found' | 'empty'>> {
  const text = input.text.trim();
  if (!text) return fail('empty', 'Write a message first');
  if (looksLikeKey(text) || input.attachments.some((a) => looksLikeKey(a.text))) return fail('key', KEY_HELD);
  const model = input.model ?? await discussionModel(store);
  const style = discussionStyle(store);
  let d = input.id ? readDiscussion(store.root, input.id) : createDiscussion(store, { title: text.split('\n')[0] ?? text, model: model.label, style: style.ref, sources: input.sources });
  if (!d) return fail('not-found', `No discussion ${input.id}`);
  const added = appendEntries(store.root, d, [{ kind: 'message', author: input.author, at: stamp(store.now?.() ?? new Date()), text }], { sources: input.sources, attachments: input.attachments.map((a) => a.name), model: model.label });
  if (!added.ok) return fail('key', added.message);
  d = added.value;
  const current = d;
  const messagesFor = (disc: Discussion) => turnMessages(systemPrompt(style.instructions, buildContext(store, input.sources, conversationText(disc))), disc, input.attachments);
  let messages = messagesFor(current);
  let tokens = estimateTokens(messages.map((m) => m.content).join('\n'));
  const chat = current.entries.filter((e) => e.kind === 'message');
  if (tokens > model.contextLength * SUMMARY_AT && chat.length > KEEP_RECENT) {
    const upTo = chat.length - KEEP_RECENT;
    const older = chat.slice(0, upTo).map((m) => (m.kind === 'message' ? `${m.author}: ${m.text}` : '')).join('\n\n');
    const summary = await write('discussion', summaryMessages(older));
    const saved = summary ? appendEntries(store.root, current, [{ kind: 'summary', upTo, text: summary }]) : undefined;
    if (saved?.ok) {
      d = saved.value;
      messages = messagesFor(saved.value);
      tokens = estimateTokens(messages.map((m) => m.content).join('\n'));
    }
  }
  const context = buildContext(store, input.sources, conversationText(d));
  return ok({ discussion: d, messages, context, tokens, contextLength: model.contextLength });
}

/** Saves the assistant's reply (no commit). */
export function finishTurn(store: Store, d: Discussion, reply: string): Result<Discussion, 'key'> {
  return appendEntries(store.root, d, [{ kind: 'message', author: ASSISTANT, at: stamp(store.now?.() ?? new Date()), text: reply }]);
}
