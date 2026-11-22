// Intent stage (mock source Intent.dc.html): the intent, its approval, mock references and history (REQ-002, REQ-005, REQ-010).
import Link from 'next/link';
import { DocumentReview } from '@/components/DocumentReview';
import { Icon } from '@/components/Icons';
import { MockReferences } from '@/components/MockReferences';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/LinkButton';
import { StageLayout } from '@/components/ui/StageBar';
import { listMocks } from '@/lib/mocks/references';
import { readDocument } from '@/lib/store/documents';
import { requirementIds } from '@/lib/trace/index';
import { loadStage, type StageProps } from '../stage';

export const dynamic = 'force-dynamic';

export default async function IntentPage({ searchParams }: StageProps) {
  const { error, view } = await (searchParams as Promise<{ error?: string; view?: string }>);
  const page = await loadStage('intent');
  const { store, reviewer } = page;
  const intent = readDocument(store, 'docs/intent.md');
  const dir = store.root;
  const approved = intent.ok && intent.value.header.status === 'approved';
  return (
    <StageLayout page={page} error={error}
      meta={intent.ok ? `${page.project.id} · intent.md · ${intent.value.header.id}` : undefined}
      actions={<>
        <ButtonLink href="/explore">Change in Explore</ButtonLink>
        {approved && <ButtonLink href="/spec" variant="primary"><Icon name="arrow_forward" size={18} /> Go to spec</ButtonLink>}
      </>}>
      {intent.ok ? (
        <DocumentReview home={store.root} document="intent" doc={intent.value} reviewer={reviewer} view={view}
          note={<>Assembled from the sections you wrote in Explore, with no model call: what you wrote is what is in the file. To change it, edit the sections in Explore. {approved ? 'Once approved, your edits are saved as a change request.' : 'While this is a draft, drafting again makes a new draft version.'}</>}
          noteAction={<LinkButton href="/explore">Change in Explore</LinkButton>}
          aside={<MockReferences document="intent" references={listMocks(dir)} requirements={requirementIds(dir)} />} />
      ) : (
        <Card label="No intent yet"><p>No intent.md yet. Fill in the required sections and <Link href="/explore">draft it in Explore</Link>.</p></Card>
      )}
    </StageLayout>
  );
}
