// Explore (REQ-001, task R10): the page saves the user's edits, asks for reviews, sends replies and applies
// Accept, Clear, Apply, Dismiss and "Add as requirement". One review at a time per process; a review that is
// cancelled (the user typed again) saves nothing.
import { z } from 'zod';
import { applyAnswer, reviewAll } from '@/lib/brainstorm/review';
import { applyAction, applyEdits, loadContext, writeExplore, type SectionAction } from '@/lib/brainstorm/session';
import { exploreView } from '@/lib/brainstorm/view';
import { describeProviderError } from '@/lib/providers/errors';
import { providerForTask } from '@/lib/providers/registry';
import { serverStore } from '@/lib/store/server-store';

const key = z.string().min(1).max(200);
const edit = z.strictObject({
  key,
  value: z.string().max(20_000).optional(),
  rows: z.array(z.strictObject({ id: z.string().regex(/^REQ-\d{3,}$/).optional(), text: z.string().max(2_000), origin: z.enum(['user', 'suggested', 'accepted']).optional() })).max(200).optional(),
});
const body = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('save'), edits: z.array(edit).max(50) }),
  z.strictObject({ op: z.literal('review') }),
  z.strictObject({ op: z.literal('reply'), key, text: z.string().trim().min(1).max(4_000) }),
  z.strictObject({
    op: z.literal('action'),
    action: z.discriminatedUnion('op', [
      z.strictObject({ op: z.literal('accept'), key, row: z.number().int().min(0).optional() }),
      z.strictObject({ op: z.literal('clear'), key, row: z.number().int().min(0).optional() }),
      z.strictObject({ op: z.literal('apply'), key, thread: z.number().int().min(0).optional() }),
      z.strictObject({ op: z.literal('dismiss'), key }),
      z.strictObject({ op: z.literal('add-row'), key }),
    ]),
  }),
]);

const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function POST(request: Request): Promise<Response> {
  const input = body.safeParse(await request.json().catch(() => undefined));
  if (!input.success) return json({ error: 'Invalid request' }, 400);
  const store = serverStore();
  const context = loadContext(store);
  if (!context.ok) return json({ error: context.message }, 404);

  if (input.data.op === 'save' || input.data.op === 'action') {
    const next = input.data.op === 'save' ? applyEdits(context.value, input.data.edits) : applyAction(context.value, input.data.action as SectionAction);
    if (!next.ok) return json({ error: next.message, view: exploreView(context.value) }, 409);
    writeExplore(store, next.value);
    return json({ view: exploreView({ ...context.value, state: next.value }) });
  }

  const reply = input.data.op === 'reply' ? { key: input.data.key, text: input.data.text } : undefined;
  const resolved = providerForTask(store, 'brainstorm');
  if (!resolved.ok) return json({ error: resolved.message, view: exploreView(context.value) }, 502);
  const reviewed = await reviewAll(context.value, resolved.value.provider, {
    model: resolved.value.choice.model, signal: request.signal, log: (line) => console.log(line),
    describeError: (error) => describeProviderError(resolved.value.choice.provider, error),
  }, reply);
  if (!reviewed.ok) {
    if (reviewed.error === 'no-change') return json({ skipped: true, view: exploreView(context.value) });
    if (reviewed.error === 'aborted') return json({ aborted: true }, 499);
    return json({ error: reviewed.message, view: exploreView(context.value) }, 502);
  }
  // Applied to the latest state, so edits saved while the review ran are kept.
  const latest = loadContext(store);
  if (!latest.ok) return json({ error: latest.message }, 404);
  const state = applyAnswer(latest.value, reviewed.value.answer, reviewed.value.now, reply, reviewed.value.reviewed);
  writeExplore(store, state);
  return json({ reviewed: true, view: exploreView({ ...latest.value, state }) });
}
