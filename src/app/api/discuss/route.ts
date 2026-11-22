// Discuss a change (REQ-017, CR-0016): one turn, streamed as JSON lines (started, chunk…, done), abortable for Stop;
// each finished turn is committed, folded into one commit per run of messages. A message that looks like a key is held before
// anything is sent or saved. Only the ticked sources and the attachments the user chose are sent.
import { z } from 'zod';
import { checkAttachment, SOURCES, type SourceId } from '@/lib/discussion/context';
import { commitTurn, DSC_ID } from '@/lib/discussion/file';
import { KEY_HELD } from '@/lib/discussion/keys';
import { extractProposal, parseProposal, retryMessage } from '@/lib/discussion/proposal';
import { finishTurn, prepareTurn } from '@/lib/discussion/turn';
import { describeProviderError } from '@/lib/providers/errors';
import { providerForTask } from '@/lib/providers/registry';
import type { ChatProvider } from '@/lib/providers/types';
import { defaultAuthor } from '@/lib/settings/settings';
import { runStartupCheck } from '@/lib/startup/check';
import { serverStore } from '@/lib/store/server-store';
import { isInitialised } from '@/lib/store/workspace';

const SOURCE_IDS = SOURCES.map((s) => s.id) as [SourceId, ...SourceId[]];
const body = z.strictObject({
  op: z.literal('send'), id: z.string().regex(DSC_ID).optional(), text: z.string().max(20_000),
  sources: z.array(z.enum(SOURCE_IDS)).max(SOURCE_IDS.length),
  attachments: z.array(z.strictObject({ name: z.string().min(1).max(200), text: z.string().max(200_000) })).max(5).default([]),
});

async function complete(provider: ChatProvider, model: string, messages: Parameters<ChatProvider['stream']>[0]): Promise<string> {
  let text = '';
  for await (const chunk of provider.stream(messages, { model })) text += chunk;
  return text;
}

export async function POST(request: Request): Promise<Response> {
  const input = body.safeParse(await request.json().catch(() => undefined));
  if (!input.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const store = serverStore();
  if (!isInitialised(store.root)) return Response.json({ error: 'Initialise the folder first' }, { status: 409 });

  const startup = await runStartupCheck(store);
  if (!startup.ok) return Response.json({ error: 'Keel is in setup mode: fix the Startup check first (/check).' }, { status: 503 });
  const attachments = [];
  for (const a of input.data.attachments) {
    const checked = checkAttachment(a.name, a.text);
    if (!checked.ok) return Response.json({ error: checked.reason }, { status: 400 });
    attachments.push(checked.attachment);
  }
  const resolved = await providerForTask(store, 'discussion');
  if (!resolved.ok) return Response.json({ error: resolved.message }, { status: 502 });
  const { provider, choice } = resolved.value;
  const writer = async (_task: string, messages: Parameters<ChatProvider['stream']>[0]) => complete(provider, choice.model, messages).catch(() => undefined);
  const turn = await prepareTurn(store, { ...(input.data.id ? { id: input.data.id } : {}), text: input.data.text, author: (await defaultAuthor(store)) || 'You', sources: input.data.sources, attachments }, writer);
  if (!turn.ok) return Response.json(turn.error === 'key' ? { held: KEY_HELD } : { error: turn.message }, { status: turn.error === 'key' ? 422 : 400 });
  const { discussion, messages, tokens, contextLength, context } = turn.value;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      send({ started: discussion.id, tokens, contextLength, pulled: context.filter((b) => b.source === 'pulled').map((b) => b.label) });
      let reply = '';
      let stopped = false;
      try {
        for await (const chunk of provider.stream(messages, { model: choice.model })) {
          if (request.signal.aborted) { stopped = true; break; }
          reply += chunk;
          send({ chunk });
        }
        // An unreadable proposal is asked for again once (ADR-0019); if it is still unreadable it stays as text.
        const { block, rest } = extractProposal(reply);
        const parsed = block ? parseProposal(block) : undefined;
        if (!stopped && parsed && !parsed.ok) {
          const again = await complete(provider, choice.model, [...messages, { role: 'assistant', content: reply }, { role: 'user', content: retryMessage(parsed.reason) }]).catch(() => '');
          const second = extractProposal(again).block;
          if (second && parseProposal(second).ok) reply = `${rest}\n\n\`\`\`keel-proposal\n${second}\n\`\`\``;
        }
      } catch (error) {
        if (!reply) {
          send({ error: describeProviderError(choice.provider, error) });
          controller.close();
          return;
        }
      }
      const saved = finishTurn(store, discussion, stopped ? `${reply}\n\n_(Stopped)_` : reply || '_(No answer)_');
      // Committed as it goes, so leaving the screen never loses messages (one commit per run of messages).
      if (saved.ok) await commitTurn(store, saved.value).catch(() => undefined);
      send(saved.ok ? { done: discussion.id } : { error: saved.message });
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
