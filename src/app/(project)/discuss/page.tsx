// Discuss a change, a new discussion (REQ-017, CR-0016). ?start= fills in the first message from a starter; nothing
// is sent until the user presses Send.
import { DiscussView } from './view';

export const dynamic = 'force-dynamic';

export default async function DiscussPage({ searchParams }: { searchParams: Promise<{ error?: string; start?: string }> }) {
  return <DiscussView params={await searchParams} />;
}
