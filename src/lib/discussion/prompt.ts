// The messages for one turn of Discuss a change (CR-0016): the discussion style, what the assistant can see, the
// proposal format, then the conversation (the latest summary in place of the messages it covers).
import type { ChatMessage } from '../providers/types';
import { ASSISTANT, type Discussion } from './file';
import type { Attachment, ContextBlock } from './context';

/** In the system prompt; the fake provider looks for it. */
export const DISCUSS_MARKER = 'Keel discussion: discuss the change, then propose it as a keel-proposal block.';
export const SUMMARY_MARKER = 'Summarise these messages of a discussion about a software change.';

export const PROPOSAL_FORMAT = [
  'When the open questions are settled, or the user asks for it, end your reply with exactly one fenced block:',
  '```keel-proposal',
  '{"title": "...", "why": "...", "what": ["..."], "requirements": [{"id": "REQ-005 or new", "change": "new | changed | removed", "text": "..."}],',
  ' "impact": [{"area": "...", "requirements": ["REQ-005 or new"], "what": "..."}], "scenarios": [{"title": "...", "requirement": "REQ-005 or new"}],',
  ' "tasks": [{"title": "...", "files": ["src/... or path (new)"]}], "decision": {"title": "...", "alternatives": ["..."]}, "dependsOn": ["CR-0009"], "screens": ["..."]}',
  '```',
  'Never choose IDs for new requirements, tasks, decisions or change requests: write "new". Use only existing IDs from what you can see. The user creates the change request with a button; you never write files.',
].join('\n');

export function systemPrompt(style: string, blocks: ContextBlock[]): string {
  return [
    style.trim(),
    DISCUSS_MARKER,
    PROPOSAL_FORMAT,
    'What you can see of the project:',
    ...blocks.map((b) => `## ${b.label}\n\n${b.text}`),
  ].join('\n\n');
}

/** The conversation as chat messages: the latest summary, then the messages after it; attachments go with the newest user message. */
export function turnMessages(system: string, d: Discussion, attachments: Attachment[] = []): ChatMessage[] {
  const summary = [...d.entries].reverse().find((e) => e.kind === 'summary');
  const messages = d.entries.filter((e) => e.kind === 'message');
  const after = summary && summary.kind === 'summary' ? messages.slice(summary.upTo) : messages;
  const chat: ChatMessage[] = [{ role: 'system', content: system }];
  if (summary) chat.push({ role: 'user', content: `Summary of the earlier messages:\n\n${summary.text}` });
  for (const m of after) if (m.kind === 'message') chat.push({ role: m.author === ASSISTANT ? 'assistant' : 'user', content: m.text });
  const last = chat.at(-1);
  if (last && last.role === 'user' && attachments.length) last.content += attachments.map((a) => `\n\nAttached file ${a.name}:\n\n${a.text}`).join('');
  return chat;
}

export function summaryMessages(text: string): ChatMessage[] {
  return [{ role: 'system', content: `${SUMMARY_MARKER} Keep decisions, open questions, requirement IDs and the user's words. At most 200 words.` }, { role: 'user', content: text }];
}
