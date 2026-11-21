// Thumbnail of an image mock reference (REQ-010). Serves only PNG and JPG files checked by content,
// with headers that stop the browser from treating them as anything else.
import { mockImage, MOCK_ID } from '@/lib/mocks/references';
import { serverStore } from '@/lib/store/server-store';
import { projectDir, SLUG } from '@/lib/store/workspace';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; mock: string }> }): Promise<Response> {
  const { id, mock } = await params;
  if (!SLUG.test(id) || !MOCK_ID.test(mock)) return new Response(null, { status: 404 });
  const image = mockImage(projectDir(id, serverStore().home), mock);
  if (!image.ok) return new Response(null, { status: 404 });
  return new Response(Buffer.from(image.value.bytes), {
    headers: {
      'content-type': image.value.type,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'cache-control': 'no-store',
    },
  });
}
