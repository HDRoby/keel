// The Spec's Clickable mock tab (mock source Spec.dc.html › Clickable mock, REQ-010, task R14): the status against
// the gate setting, the prompt pack (Prompt or Screens it asks for, Copy and Download), attaching the result, the
// mock sets with their spec version, and the other references.
import Link from 'next/link';
import { MockUpload } from './mock-upload';
import css from './spec.module.css';
import { CopyButton } from '@/components/CopyButton';
import { Icon } from '@/components/Icons';
import { MockReferences } from '@/components/MockReferences';
import { ButtonLink } from '@/components/ui/Button';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Segmented } from '@/components/ui/Segmented';
import { StatusLine } from '@/components/ui/StatusLine';
import { Tag } from '@/components/ui/Tag';
import { mockCheck } from '@/lib/gates/rules';
import { listMocks } from '@/lib/mocks/references';
import { mockPrompt } from '@/lib/mocks/prompt';
import { formHasUi, mockStatus, readSets } from '@/lib/mocks/sets';
import type { Store } from '@/lib/store/db';
import { readProject } from '@/lib/store/workspace';
import { requirementIds } from '@/lib/trace/index';

const GATE_LABEL = { recommended: 'Recommended', required: 'Required', off: 'Off' } as const;

export function MockPanel({ store, view }: { store: Store; view?: string }) {
  const prompt = mockPrompt(store);
  if (!prompt) return null;
  const project = readProject(store.root);
  const gate = project.ok ? project.value.mockGate : 'recommended';
  const ui = formHasUi(store.root);
  const status = mockStatus(store);
  const sets = readSets(store.root).sort((a, b) => b.set - a.set);
  const current = sets.find((s) => s.status === 'current');
  const check = mockCheck({ mock: { gate, ui, status } });
  const line = status === 'current' && current
    ? `Mock set ${current.set} is current: ${new Set(current.files.filter((f) => f.kind !== 'link').map((f) => f.screen ?? f.source)).size} screens made from spec v${current.specVersion}. The plan links its tasks to these screens.`
    : `${status === 'stale' && current ? `Mock set ${current.set} was made from spec v${current.specVersion} and is out of date.` : 'No mock set yet.'} ${ui ? `This project has a UI, so a current mock set is ${gate === 'required' ? 'required' : gate === 'recommended' ? 'recommended' : 'optional'} before the plan.` : 'The Form decision has no UI, so a mock set is optional.'}`;
  const screensView = view === 'screens';
  return (
    <section aria-labelledby="mock-title" id="mock" className={css.panel}>
      <h2 id="mock-title" className={css.panelTitle}>Clickable mock</h2>
      <StatusLine label="Mock status" tone={check === 'lock' ? 'danger' : check === 'warn' ? 'warn' : 'ok'}
        legend={<Link href="/settings">{GATE_LABEL[gate]} · change in Settings</Link>}>{line}</StatusLine>

      <div className={css.stack}>
        <div className={css.packHead}>
          <div className={css.stack}>
            <h3 className={css.topicTitle}>1 · Make a clickable mock elsewhere</h3>
            <p className={css.muted}>Keel does not draw mocks. It writes a prompt from this spec for a model that builds clickable prototypes. Refine the mock there, then export the screens as PNG, and the HTML source if you can.</p>
          </div>
          <Segmented label="Prompt view" items={[{ href: '/spec?tab=mock', label: 'Prompt', current: !screensView }, { href: '/spec?tab=mock&view=screens', label: 'Screens it asks for', current: screensView }]} />
        </div>
        {screensView ? (
          <ul className={css.screens} aria-label="Screens it asks for">
            {prompt.screens.map((s) => <li key={s.number}><span className={css.req}>{s.number}</span><strong>{s.name}</strong><span className={css.muted}>{s.shows}</span><span className={css.muted}>{s.reqs.join(', ')}</span></li>)}
          </ul>
        ) : <CodeBlock label="Clickable mock prompt">{prompt.text}</CodeBlock>}
        <div className={css.row}>
          <CopyButton text={prompt.text} label="Copy prompt" />
          <ButtonLink href="/api/mock-prompt" download><Icon name="download" size={18} /> Download {prompt.fileName}</ButtonLink>
          <span className={css.muted}>Built from the requirements, scenarios, design decisions and your UI standard. It asks for realistic sample data and file names Keel can read back.</span>
        </div>
      </div>

      <div className={css.subPanel}>
        <h3 className={css.topicTitle}>2 · Attach the result</h3>
        <MockUpload screens={prompt.screens} nextSet={Math.max(0, ...sets.map((s) => s.set)) + 1} specVersion={prompt.specVersion} />
      </div>

      <div className={css.subPanel}>
        <h3 className={css.topicTitle}>Mock sets</h3>
        {sets.length === 0 ? <p className={css.muted}>No mock set yet.</p> : sets.map((s) => {
          const stale = s.status === 'current' && s.specVersion < prompt.specVersion;
          const screens = [...new Set(s.files.filter((f) => f.kind !== 'link').map((f) => f.screen ?? f.source))];
          return (
            <section key={s.set} className={css.set} aria-label={`Mock set ${s.set}`}>
              <div className={css.setHead}>
                <Icon name="photo_library" tone="accent" />
                <span className={css.setTitle}>Mock set {s.set} · from spec v{s.specVersion}</span>
                {s.status === 'replaced' ? <Tag>Replaced</Tag> : stale ? <Tag tone="warn">Out of date · made from spec v{s.specVersion}, the spec is v{prompt.specVersion}</Tag> : <Tag tone="ok">Current</Tag>}
              </div>
              <p className={css.muted}>{screens.length} screens, {[...new Set(s.files.filter((f) => f.kind !== 'link').map((f) => f.kind.toUpperCase()))].join(' and ') || 'no files'} · exported {s.exported} · docs/mocks/set-{s.set}/{s.link ? <> · <a href={s.link} rel="noopener noreferrer" target="_blank">live prototype</a></> : null}</p>
              <div className={css.chips}>{screens.map((n) => <Tag key={n}>{n}</Tag>)}</div>
            </section>
          );
        })}
      </div>

      <div className={css.subPanel}>
        <MockReferences bare document="spec" references={listMocks(store.root)} requirements={requirementIds(store.root)} />
      </div>
    </section>
  );
}
