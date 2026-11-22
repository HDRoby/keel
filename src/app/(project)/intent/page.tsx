// Intent stage (mockup: intent.png): the intent, its approval, mock references and history (REQ-002, REQ-005, REQ-010).
import Link from 'next/link';
import { DocumentReview } from '@/components/DocumentReview';
import { MockReferences } from '@/components/MockReferences';
import { StageLayout } from '@/components/StageBar';
import { listMocks } from '@/lib/mocks/references';
import { readDocument } from '@/lib/store/documents';
import { requirementIds } from '@/lib/trace/index';
import { loadStage, type StageProps } from '../stage';

export const dynamic = 'force-dynamic';

export default async function IntentPage({ searchParams }: StageProps) {
  const { error } = await searchParams;
  const page = await loadStage('intent');
  const { store, reviewer } = page;
  const intent = readDocument(store, 'docs/intent.md');
  const dir = store.root;
  return (
    <StageLayout page={page} error={error}
      meta={intent.ok ? `${page.project.id} · intent.md · ${intent.value.header.id}` : undefined}
      actions={<>
        <Link href={`/explore`} className="button">Back to brainstorm</Link>
        {intent.ok && intent.value.header.status === 'approved' && <Link href={`/spec`} className="button primary">Go to spec</Link>}
      </>}>
      {intent.ok ? (
        <DocumentReview home={store.root} document="intent" doc={intent.value} reviewer={reviewer}
          aside={<MockReferences document="intent" references={listMocks(dir)} requirements={requirementIds(dir)} />} />
      ) : (
        <section className="card"><p>Every required section is captured. <Link href={`/explore`}>Draft intent.md in Explore</Link>.</p></section>
      )}
    </StageLayout>
  );
}
