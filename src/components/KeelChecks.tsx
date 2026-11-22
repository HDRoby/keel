// Opening a folder that already uses Keel (REQ-012, CR-0010): shown before the current stage only when something
// needs attention: an older config (upgrade in one Keel commit, after you agree), changes waiting in Read-back, and
// templates, styles or standards the config names but the folder no longer has.
import Link from 'next/link';
import { upgradeConfigAction } from '@/app/(project)/actions';
import type { KeelChecks } from '@/lib/keel/checks';
import { inline } from './Markdown';
import { ErrorAlert, Topbar } from './Shell';
import { SubmitButton } from './SubmitButton';
import { ButtonLink } from './ui/Button';
import { Card } from './ui/Card';
import { Notice } from './ui/Notice';
import { PageHeader } from './ui/PageHeader';
import styles from './FolderFound.module.css';

export function KeelChecksPage({ title, checks, stage, error, upgraded }: { title: string; checks: KeelChecks; stage: string; error?: string; upgraded: boolean }) {
  return (
    <>
      <Topbar title="Open" />
      <main className="content narrow">
        <PageHeader title={`Open ${title}`} description={upgraded && !checks.upgrade && !checks.pending && !checks.missing.length ? 'This folder already uses Keel, and everything is ready.' : 'This folder already uses Keel. Before it opens, a few things need your attention.'}
          actions={<ButtonLink href="/?open=1" variant="primary">Continue to {stage}</ButtonLink>} />
        <ErrorAlert error={error} />
        {upgraded && <Notice kind="success" role="status">The config is upgraded, in one Keel commit.</Notice>}
        {checks.upgrade && (
          <Card title="Upgrade the config" label="Upgrade the config" meta={`.keel/config.yml is format ${checks.upgrade.from}; this Keel writes format ${checks.upgrade.to}. Nothing changes until you agree.`}>
            <div className={styles.stack}>
              <ul className={styles.facts} aria-label="What the upgrade changes">{checks.upgrade.changes.map((c) => <li key={c}>{inline(c, c)}</li>)}</ul>
              <form action={upgradeConfigAction}><SubmitButton primary label="Upgrade in one Keel commit" busyLabel="Upgrading…" /></form>
            </div>
          </Card>
        )}
        {checks.pending > 0 && (
          <Notice kind="warning" title={`${checks.pending} change${checks.pending === 1 ? '' : 's'} waiting in Read-back`}>
            The coding agent or someone else changed Keel&apos;s documents since the last run. <Link href="/handoff">Review them on the Handoff page</Link>.
          </Notice>
        )}
        {checks.missing.length > 0 && (
          <Notice kind="warning" title="Some files the config names are missing">
            <ul className={styles.facts}>{checks.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            Restore them from git, or pick another one in <Link href="/setup">Project setup</Link>. Keel keeps working with what is there.
          </Notice>
        )}
      </main>
    </>
  );
}
