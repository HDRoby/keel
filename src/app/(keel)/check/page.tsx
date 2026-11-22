// The Startup check (mock source Startup.dc.html, REQ-009, REQ-012, REQ-005, CR-0012): each check with OK, Needs
// fixing or Waiting, the reason in plain words and how to fix it. While a check fails Keel is in setup mode.
import { checkAgainAction } from './actions';
import css from './check.module.css';
import { Icon } from '@/components/Icons';
import { Topbar } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tag } from '@/components/ui/Tag';
import { cx } from '@/components/ui/cx';
import { runStartupCheck, type CheckItem } from '@/lib/startup/check';
import { serverStore } from '@/lib/store/server-store';

export const dynamic = 'force-dynamic';

const LOOK: Record<CheckItem['state'], { icon: string; tone: 'ok' | 'danger' | 'muted'; tag: string }> = {
  ok: { icon: 'check_circle', tone: 'ok', tag: 'OK' },
  bad: { icon: 'error', tone: 'danger', tag: 'Needs fixing' },
  waiting: { icon: 'radio_button_unchecked', tone: 'muted', tag: 'Waiting' },
};

export default async function CheckPage() {
  const store = serverStore();
  const result = await runStartupCheck(store);
  const bad = result.checks.find((c) => c.state === 'bad');
  const [title, intro] = result.ok ? ['All set', 'Your settings, model access and project config are fine.']
    : result.firstRun ? ['Set up Keel first', 'Keel needs a model provider before it can comment, draft or review. It takes a minute.']
    : bad?.id === 'project' ? ['This project\'s config has a problem', 'Keel will not open the project until .keel/config.yml is valid, so nothing is written with a wrong setting.']
    : bad?.id === 'models' ? ['A model is missing', 'One task points to a model that is not available. Fix it before going on.']
    : ['Keel cannot reach your model', 'Everything that needs a model is paused until this is fixed. Your documents are safe and still readable.'];
  return (
    <>
      <Topbar title="Startup check" />
      <main className="content narrow">
        <PageHeader title={title} description={intro} />
        <Card title="Startup check" meta={`Runs every time Keel starts · took ${(result.ms / 1000).toFixed(1)} s · ${new Date(result.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}>
          <ul className={css.checks} aria-label="Checks">
            {result.checks.map((c) => (
              <li key={c.id} aria-label={c.title} className={cx(css.check, css[c.state])}>
                <Icon name={LOOK[c.state].icon} tone={LOOK[c.state].tone} />
                <div className={css.body}>
                  <div className={css.head}><span className={css.title}>{c.title}</span><Tag tone={c.state === 'ok' ? 'ok' : c.state === 'bad' ? 'danger' : 'neutral'}>{LOOK[c.state].tag}</Tag></div>
                  <span className={css.text}>{c.message}</span>
                  {c.line && <code className={css.line}>line {c.line.number}: {c.line.text}</code>}
                  {c.fix && <span className={css.fix}>{c.fix}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        {!result.ok && (
          <Notice kind="warning" title={result.projectBad ? 'The project stays closed until the config is valid' : 'Keel is in setup mode'}>
            {result.projectBad ? 'Only Project setup and Settings are available. Fix the config there, then check again.' : 'Only Settings is available until every check passes. The other pages open as soon as it is fixed.'}
          </Notice>
        )}
        <div className={css.actions}>
          {!result.ok && (bad?.id === 'project'
            ? <ButtonLink href="/setup" variant="primary"><Icon name="edit" size={18} /> Open Project setup</ButtonLink>
            : <ButtonLink href="/settings" variant="primary"><Icon name="settings" size={18} /> {result.firstRun ? 'Choose a model provider' : 'Open Settings'}</ButtonLink>)}
          {result.ok && <ButtonLink href="/" variant="primary">Continue</ButtonLink>}
          <form action={checkAgainAction}><SubmitButton label="Check again" busyLabel="Checking…" /></form>
          <span className={css.note}>{result.ok ? 'When every check passes, Keel skips this page and opens the project directly.' : 'Keel also checks again on its own when you come back from Settings.'}</span>
        </div>
      </main>
    </>
  );
}
