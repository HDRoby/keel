// Brainstorm turn: records the answer (if any), then streams the next question and saves it (REQ-001).
import { z } from 'zod';
import { fallbackQuestion, loadContext, pendingQuestion, questionPrompt, recordAnswer, recordQuestion } from '@/lib/brainstorm/session';
import { describeProviderError } from '@/lib/providers/errors';
import { providerForTask } from '@/lib/providers/registry';
import { serverStore } from '@/lib/store/server-store';
import { SLUG } from '@/lib/store/workspace';

const body = z.strictObject({ answer: z.string().trim().min(1).max(20_000).optional() });
const slug = z.string().regex(SLUG);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = slug.safeParse((await params).id);
  const input = body.safeParse(await request.json().catch(() => undefined));
  if (!id.success || !input.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const store = serverStore();
  let context = loadContext(store, id.data);
  if (!context.ok) return Response.json({ error: context.message }, { status: 404 });
  if (input.data.answer) {
    const answered = await recordAnswer(store, context.value, input.data.answer);
    if (!answered.ok) return Response.json({ error: answered.message }, { status: 409 });
    context = { ok: true, value: { ...context.value, session: answered.value } };
  }
  const ctx = context.value;
  const asking = pendingQuestion(ctx.session);
  if (!asking) return new Response(null, { status: 204 });

  const resolved = providerForTask(store, 'brainstorm');
  const chunks = resolved.ok
    ? resolved.value.provider.stream(questionPrompt(ctx, asking), { model: resolved.value.choice.model })[Symbol.asyncIterator]()
    : undefined;
  const encoder = new TextEncoder();
  let text = '';
  const finish = async (controller: ReadableStreamDefaultController<Uint8Array>, note?: string) => {
    if (!text.trim()) {
      text = fallbackQuestion(ctx, asking);
      controller.enqueue(encoder.encode(text));
    }
    if (note) {
      const line = `\n\n(${note})`;
      controller.enqueue(encoder.encode(line));
      text += line;  // saved with the question, so the transcript still says why after a reload
    }
    await recordQuestion(store, ctx.session, text);
    controller.close();
  };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!chunks) return finish(controller, 'No model is available for the brainstorm. Check Settings.');
      try {
        const next = await chunks.next();
        if (next.done) return finish(controller);
        text += next.value;
        controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        await finish(controller, resolved.ok ? `${describeProviderError(resolved.value.choice.provider, error)}` : 'The model could not be reached. Check Settings.');
      }
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'x-keel-section': encodeURIComponent(asking.section), 'x-keel-step': asking.step },
  });
}
