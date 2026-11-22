// The startup check as JSON (CR-0012), for `npx keel` to print in the terminal before the browser opens.
import { runStartupCheck, startupLines } from '@/lib/startup/check';
import { serverStore } from '@/lib/store/server-store';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const result = await runStartupCheck(serverStore(), { force: true });
  return Response.json({ ok: result.ok, lines: startupLines(result) }, { headers: { 'cache-control': 'no-store' } });
}
