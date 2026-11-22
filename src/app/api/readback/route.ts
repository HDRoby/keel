// Read-back check when the Handoff page gets focus (task R6): reads the local repository, never commits.
import { checkFolder } from '@/lib/readback/check';
import { serverStore } from '@/lib/store/server-store';

export async function POST(): Promise<Response> {
  const checked = await checkFolder(serverStore());
  return checked.ok
    ? Response.json({ pending: checked.value.pending.length, checked: checked.value.checked })
    : Response.json({ error: checked.message }, { status: 409 });
}
