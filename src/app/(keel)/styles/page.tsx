// Brainstorm styles (mock source Styles.dc.html, REQ-011): the styles in .keel/styles; pick one to see and edit it.
import { styleGroups } from './groups';
import { LibraryLayout } from '@/components/LibraryLayout';
import { Card } from '@/components/ui/Card';
import { serverStore } from '@/lib/store/server-store';
import { isInitialised } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

export default async function StylesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const home = serverStore().root;
  return (
    <LibraryLayout screen="Brainstorm styles" title="Brainstorm styles" meta=".keel/styles" error={error} initialised={isInitialised(home)} what="brainstorm styles"
      description={<>How the assistant reviews your sections in Explore. Stored in <code>.keel/styles</code>. Editing saves a new version; brainstorms keep the version they started with.</>}
      groups={styleGroups(home)}>
      <Card label="No style selected"><p>Pick a style on the left to see its instructions and versions.</p></Card>
    </LibraryLayout>
  );
}
