// Roadmap (mock source Roadmap.dc.html): docs/roadmap.md of this project as a board. Now (read-only), Next and
// Later as columns, Not doing collapsed, and the file as Markdown. A Next item can be raised as a change request.
import type { ReactNode } from 'react';
import { raiseFromRoadmapAction } from '../changes/actions';
import css from './roadmap.module.css';
import { Icon } from '@/components/Icons';
import { Markdown } from '@/components/Markdown';
import { Topbar } from '@/components/Shell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Tag } from '@/components/ui/Tag';
import { templateLabel } from '@/lib/brainstorm/session';
import { readDocument } from '@/lib/store/documents';
import { serverStore } from '@/lib/store/server-store';

export const dynamic = 'force-dynamic';

interface Item { raw: string; title: string; detail: string }
interface Column { heading: string; items: Item[] }

/** The "## " sections of the roadmap, each "- " line an item ("Title — detail" or "Title: detail"). */
function columnsOf(body: string): Record<'now' | 'next' | 'later' | 'not', Column> {
  const sections = [...body.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map((m) => ({ heading: (m[1] ?? '').trim(), text: m[2] ?? '' }));
  const find = (prefix: string): Column => {
    const s = sections.find((x) => x.heading.toLowerCase().startsWith(prefix));
    const items = (s?.text ?? '').replace(/<!--[\s\S]*?-->/g, '').split('\n').map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1]?.trim()).filter((l): l is string => Boolean(l))
      .map((line) => {
        const [title = line, ...rest] = line.split(/\s+—\s+|:\s+/);
        return { raw: line, title: title.replace(/\*\*/g, ''), detail: rest.join(': ') };
      });
    return { heading: s?.heading ?? prefix, items };
  };
  return { now: find('now'), next: find('next'), later: find('later'), not: find('not doing') };
}

export default async function RoadmapPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const store = serverStore();
  const roadmap = readDocument(store, 'docs/roadmap.md');
  const markdown = view === 'markdown';
  const columns = roadmap.ok ? columnsOf(roadmap.value.body) : undefined;
  const item = (i: Item, actions?: ReactNode) => (
    <li key={i.raw} className={css.item}>
      <strong className={css.itemTitle}>{i.title}</strong>
      {i.detail && <span className={css.detail}>{i.detail}</span>}
      {actions}
    </li>
  );
  return (
    <>
      <Topbar title="Roadmap" />
      <main className="content">
        <PageHeader title="Roadmap" meta={roadmap.ok ? `${roadmap.value.header.id} v${roadmap.value.header.version} · docs/roadmap.md · every change saved as a new version` : undefined}
          description={<>What could come after the current release. Now is shown for context; the spec and plan define it. An unrelated idea gets its own folder: <code>npx keel ../another-idea</code>.</>}
          actions={roadmap.ok ? <Segmented label="Roadmap view" items={[{ href: '/roadmap', label: 'Board', current: !markdown }, { href: '/roadmap?view=markdown', label: 'Markdown', current: markdown }]} /> : undefined} />
        {!roadmap.ok || !columns ? (
          <Card label="No roadmap"><p>No roadmap yet. Keel writes <code>docs/roadmap.md</code> with the handoff.</p></Card>
        ) : markdown ? (
          <Card label="Roadmap source"><CodeBlock label="Markdown of docs/roadmap.md">{roadmap.value.body}</CodeBlock></Card>
        ) : (
          <>
            {roadmap.value.header.template ? <p className={css.meta}>Template: {templateLabel(String(roadmap.value.header.template))}</p> : null}
            <div className={css.board}>
              <section aria-label="Now" className={css.now}>
                <div className={css.head}><h2 className={css.title}>{columns.now.heading.replace(/\s*\((.+)\)$/, ' · $1')}</h2><span className={css.readonly}><Icon name="lock" size={16} /> Read-only</span></div>
                <p className={css.sub}>From the current spec and plan.</p>
                {columns.now.items.length ? <ul className={css.items}>{columns.now.items.map((i) => item(i))}</ul> : <Markdown text="_Nothing listed yet._" />}
                <ButtonLink href="/plan" variant="text">Open the plan</ButtonLink>
              </section>
              <Card label="Next" title="Next" meta="Likely the next release. Ready to start." actions={<Tag>{String(columns.next.items.length)}</Tag>}>
                <ul className={css.items} aria-label="Next items">
                  {columns.next.items.map((i) => item(i, (
                    <form action={raiseFromRoadmapAction} className={css.actions}>
                      <input type="hidden" name="item" value={i.raw} />
                      <Button type="submit" variant="secondary" small>Raise change request</Button>
                    </form>
                  )))}
                </ul>
                {columns.next.items.length === 0 && <p className={css.sub}>Nothing in Next yet.</p>}
              </Card>
              <Card label="Later" title="Later" meta="Possible future work. No commitment." actions={<Tag>{String(columns.later.items.length)}</Tag>}>
                <ul className={css.items}>{columns.later.items.map((i) => item(i))}</ul>
                {columns.later.items.length === 0 && <p className={css.sub}>Nothing in Later yet.</p>}
              </Card>
            </div>
            <details className={css.not}>
              <summary className={css.summary}><Icon name="expand_more" size={20} /> Not doing ({columns.not.items.length})</summary>
              <ul className={css.items}>{columns.not.items.map((i) => item(i))}</ul>
            </details>
          </>
        )}
      </main>
    </>
  );
}
