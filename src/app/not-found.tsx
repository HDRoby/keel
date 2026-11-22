// Not found: a document, template or style that does not exist (or an unsafe address).
import { Topbar } from '@/components/Shell';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export default function NotFound() {
  return (
    <>
      <Topbar title="Not found" />
      <main className="content narrow">
        <PageHeader title="Not found" />
        <Card label="Not found">
          <p>There is nothing at this address. It may have been removed, or the link is wrong.</p>
          <ButtonLink href="/" variant="primary">Back to Keel</ButtonLink>
        </Card>
      </main>
    </>
  );
}
