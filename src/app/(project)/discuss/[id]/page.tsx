// Discuss a change, one discussion (REQ-017, CR-0016).
import { notFound } from 'next/navigation';
import { DiscussView } from '../view';
import { DSC_ID, readDiscussion } from '@/lib/discussion/file';
import { serverStore } from '@/lib/store/server-store';

export const dynamic = 'force-dynamic';

export default async function DiscussionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; agreed?: string; parked?: string; edit?: string }> }) {
  const { id } = await params;
  if (!DSC_ID.test(id) || !readDiscussion(serverStore().root, id)) notFound();
  return <DiscussView id={id} params={await searchParams} />;
}
