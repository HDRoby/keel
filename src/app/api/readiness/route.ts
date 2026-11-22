// Runs the AI readiness check (REQ-016, CR-0015) and streams its progress, one JSON line per step, then the report
// ID. Only when the user presses Run the check; not in setup mode. Only names and the ticked files are sent.
import { z } from 'zod';
import { providerWriter } from '@/lib/generate/writer';
import { runReadiness } from '@/lib/readiness/run';
import { runStartupCheck } from '@/lib/startup/check';
import { serverStore } from '@/lib/store/server-store';

const body = z.strictObject({ ticked: z.array(z.string().min(1).max(500)).max(500) });
const holder = globalThis as typeof globalThis & { keelReadinessRunning?: boolean };

export async function POST(request: Request): Promise<Response> {
  const input = body.safeParse(await request.json().catch(() => undefined));
  if (!input.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const store = serverStore();
  const startup = await runStartupCheck(store);
  if (!startup.ok) return Response.json({ error: 'Keel is in setup mode: fix the Startup check first (/check).' }, { status: 503 });
  if (holder.keelReadinessRunning) return Response.json({ error: 'A readiness check is already running for this folder.' }, { status: 409 });
  holder.keelReadinessRunning = true;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        const run = await runReadiness(store, { ticked: input.data.ticked }, providerWriter(store), send);
        send(run.ok ? { done: run.value.report.id } : { error: run.message });
      } catch (error) {
        send({ error: error instanceof Error ? error.message.split('\n')[0] : 'The check failed' });
      } finally {
        holder.keelReadinessRunning = false;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
