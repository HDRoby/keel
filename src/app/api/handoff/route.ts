// Download the handoff package as a zip (REQ-006). Refused while the Handoff stage is locked or if a secret is found.
import { buildHandoff } from '@/lib/handoff/scaffold';
import { createZip } from '@/lib/handoff/zip';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';

export async function GET(request: Request): Promise<Response> {
  const store = serverStore();
  const project = readProject(store.root);
  const id = project.ok ? project.value.id : 'project';
  const built = await buildHandoff(store);
  if (!built.ok) {
    const back = new URL(`/handoff?error=${encodeURIComponent(built.message)}`, request.url);
    return Response.redirect(back, 303);
  }
  const zip = createZip(built.value);
  return new Response(new Uint8Array(zip), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${id}-handoff.zip"`,
      'cache-control': 'no-store',
    },
  });
}
