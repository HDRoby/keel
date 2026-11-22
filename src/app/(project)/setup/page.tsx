// Project setup (mock source SetupKeel.dc.html): change the intent template, brainstorm style or standards chosen on
// Initialise (REQ-001, REQ-011, REQ-012). Saved to .keel/config.yml as a Keel commit.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { setupAction } from '../actions';
import { Icon } from '@/components/Icons';
import { StyleCards, TemplateCards, withSections } from '@/components/SetupCards';
import css from '@/components/SetupCards.module.css';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { StandardsPicker } from '@/components/StandardsPicker';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { readExplore } from '@/lib/brainstorm/session';
import { listStyles } from '@/lib/brainstorm/styles';
import { listStandards } from '@/lib/standards/library';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';
import { templateOptions } from '@/lib/templates/library';

export const dynamic = 'force-dynamic';

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const store = serverStore();
  const session = readExplore(store);
  if (!session.ok) notFound();
  const project = readProject(store.root);
  const chosen = project.ok ? project.value.standards : [];
  const intents = templateOptions(store.root, 'intent', 'all').map((t) => withSections(store.root, t));
  const pastExplore = existsSync(join(store.root, 'docs', 'intent.md'));
  return (
    <>
      <Topbar title="Project setup" />
      <main className="content narrow">
        <PageHeader title="Project setup"
          description={<>{project.ok ? `${project.value.title} · ${project.value.id} · ` : ''}<code>{store.root}</code>. Change the templates, brainstorm style or standards. Saved to <code>.keel/config.yml</code> and committed as a Keel commit.</>} />
        <ErrorAlert error={error} />
        {pastExplore && (
          <Notice kind="info" title="The project is past Explore">A new template or style only affects a reopened brainstorm; approved documents keep the ones they were made with.</Notice>
        )}
        <form action={setupAction} className={css.form}>
          <Card title={<span id="template-heading">Intent template</span>} actions={<LinkButton href="/templates">Manage templates</LinkButton>}>
            <div className={css.stack}>
              <TemplateCards name="template" options={intents} chosen={session.value.template} labelledBy="template-heading" columns="two" />
              <p className={css.note}>Changing the template maps your existing answers to the new sections. The assistant then asks only about what is missing.</p>
            </div>
          </Card>
          <Card title={<span id="style-heading">Brainstorm style</span>} actions={<LinkButton href="/styles">Manage styles</LinkButton>}>
            <div className={css.stack}>
              <StyleCards styles={listStyles(store.root)} chosen={session.value.style} labelledBy="style-heading" />
              <p className={css.note}>A new style applies to the reviews that follow; earlier comments stay as they are.</p>
            </div>
          </Card>
          <Card title="Standards" meta="Conventions and guidelines the spec, plan and code are checked against." actions={<LinkButton href="/standards">Manage standards</LinkButton>}>
            <StandardsPicker standards={listStandards(store.root)} chosen={chosen} />
          </Card>
          <div className={css.inline}>
            <Button type="submit" variant="primary" icon={<Icon name="check" size={18} />}>Save and return to brainstorm</Button>
            <ButtonLink href="/explore" variant="text">Cancel</ButtonLink>
          </div>
        </form>
      </main>
    </>
  );
}
