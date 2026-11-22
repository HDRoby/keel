// Download the clickable mock prompt as keel-mock-prompt-spec-v<N>.md (REQ-010, CR-0009). Built from the spec; no model call.
import { mockPrompt } from '@/lib/mocks/prompt';
import { serverStore } from '@/lib/store/server-store';

export async function GET(request: Request): Promise<Response> {
  const prompt = mockPrompt(serverStore());
  if (!prompt) return Response.redirect(new URL('/spec?error=There+is+no+spec+yet', request.url), 303);
  return new Response(prompt.text, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${prompt.fileName}"`,
      'cache-control': 'no-store',
    },
  });
}
