// Thumbnail of an image mock reference (REQ-010). Serves only PNG and JPG files checked by content,
// with headers that stop the browser from treating them as anything else.
import { mockImage, MOCK_ID } from '@/lib/mocks/references';
import { serverStore } from '@/lib/store/server-store';

export async function GET(_request: Request, { params }: { params: Promise<{ mock: string }> }): Promise<Response> {
  const { mock } = await params;
  if (!MOCK_ID.test(mock)) return new Response(null, { status: 404 });
  const image = mockImage(serverStore().root, mock);
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
