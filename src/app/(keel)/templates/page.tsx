// Template library (mock source Templates.dc.html, REQ-003): the templates by kind; pick one to see and edit it.
import { templateGroups } from './groups';
import { LibraryLayout } from '@/components/LibraryLayout';
import { Card } from '@/components/ui/Card';
import { serverStore } from '@/lib/store/server-store';
import { isInitialised } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const home = serverStore().root;
  return (
    <LibraryLayout screen="Templates" title="Templates" meta=".keel/templates" error={error} initialised={isInitialised(home)} what="templates"
      description={<>Templates define the metadata and sections of every document. They live in <code>.keel/templates</code> (the agent kit in <code>.keel/agent-kit</code>) and are versioned with the project, so each document records the template it was built from. Editing saves a new version; a template in use cannot be removed.</>}
      groups={templateGroups(home)}>
      <Card label="No template selected"><p>Pick a template on the left to see its versions, the documents that use it, and its content.</p></Card>
    </LibraryLayout>
  );
}
