// Handoff stage (mock source Handoff.dc.html): the repository scaffold for any coding agent, as a zip (REQ-006).
import { acceptChangeAction, checkRepositoryAction, dismissChangeAction, pushAction, saveHandoffCommandsAction, writeHandoffAction } from '../actions';
import { remoteLabel, remoteOf } from '@/lib/store/remote';
import { SubmitButton } from '@/components/SubmitButton';
import { changedContent, keelContent, readbackState, WORKING_TREE } from '@/lib/readback/changes';
import { CheckOnFocus } from '@/components/CheckOnFocus';
import { readbackInterval } from '@/lib/readback/schedule';
import { parseDocument } from '@/lib/store/documents';
import { compactChanges, lineChanges } from '@/lib/versions/diff';
import { ErrorAlert } from '@/components/Shell';
import { Icon } from '@/components/Icons';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { FileTree, type FileKind, type FileRow } from '@/components/ui/FileTree';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { Tag, type TagTone } from '@/components/ui/Tag';
import css from './handoff.module.css';
import { StageLayout } from '@/components/ui/StageBar';
import { handoffCommands, type Commands } from '@/lib/handoff/scaffold';
import { besidePath, planHandoff, type FileState, type PlannedFile } from '@/lib/handoff/write';
import { loadStage, type StageProps } from '../stage';

export const dynamic = 'force-dynamic';

const LABELS: Record<keyof Commands, string> = {
  install: 'Install', run: 'Run the app', test: 'Unit tests', scenarios: 'Acceptance scenarios', verify: 'All checks (CI)',
};

const STATE: Record<FileState, { label: string; tone: TagTone; kind: FileKind }> = {
  new: { label: 'New', tone: 'accent', kind: 'new' },
  changed: { label: 'Changed', tone: 'accent', kind: 'changed' },
  unchanged: { label: 'Unchanged', tone: 'neutral', kind: 'plain' },
  conflict: { label: 'Conflict', tone: 'warn', kind: 'conflict' },
  kept: { label: 'Yours, kept', tone: 'neutral', kind: 'kept' },
};

const PURPOSE: Record<string, string> = {
  'AGENTS.md': 'Instructions, conventions, verification, agent roles', 'CLAUDE.md': 'Points Claude Code to AGENTS.md', 'REVIEW.md': 'Review policy',
  'README.md': 'How to run the project', '.claude': 'Subagents and standards as skills', 'features': 'Scenarios and failing step stubs',
  '.github': 'CI that runs the tests', 'docs': 'Traceability and the documents', 'package.json': 'Scripts for the commands', 'tsconfig.json': 'TypeScript settings',
  'playwright.config.ts': 'Runs the scenarios', '.gitignore': 'Files kept out of git',
};

/** The planned files as a tree by top-level folder; a folder opens when one of its files is a conflict. */
function treeOf(files: PlannedFile[], row: (f: PlannedFile) => FileRow): FileRow[] {
  const top = new Map<string, PlannedFile[]>();
  for (const f of files) {
    const head = f.path.includes('/') ? f.path.split('/')[0] ?? f.path : f.path;
    top.set(head, [...(top.get(head) ?? []), f]);
  }
  return [...top.entries()].map(([head, group]) => {
    if (group.length === 1 && group[0]?.path === head) return row(group[0]);
    const worst = (['conflict', 'changed', 'new', 'kept', 'unchanged'] as FileState[]).find((st) => group.some((f) => f.state === st)) ?? 'unchanged';
    return {
      path: `${head}/`, name: `${head}/`, what: PURPOSE[head] ?? '', kind: STATE[worst].kind, open: group.some((f) => f.state === 'conflict'),
      when: <Tag tone={STATE[worst].tone}>{STATE[worst].label}</Tag>, children: group.map(row),
    };
  });
}

/** "3 new, 1 changed, 12 unchanged, 1 conflict." */
function counts(files: PlannedFile[]): string {
  const order: FileState[] = ['new', 'changed', 'unchanged', 'conflict', 'kept'];
  const parts = order.map((state) => [state, files.filter((f) => f.state === state).length] as const).filter(([, n]) => n > 0)
    .map(([state, n]) => `${n} ${STATE[state].label.toLowerCase()}${state === 'conflict' && n > 1 ? 's' : ''}`);
  return `${files.length} files: ${parts.join(', ')}.`;
}

/** An ISO time as "YYYY-MM-DD HH:MM". */
function when(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

export default async function HandoffPage({ searchParams }: StageProps) {
  const { error, notice } = await (searchParams as Promise<{ error?: string; notice?: string }>);
  const page = await loadStage('handoff');
  const planned = page.gate.available ? await planHandoff(page.store) : undefined;
  const commands = handoffCommands(page.store);
  const remote = await remoteOf(page.store.root);
  const readback = readbackState(page.store);
  const interval = readbackInterval();
  // The agent's text is what is in the folder now; Keel's is its last committed version.
  const pending = await Promise.all(readback.pending.map(async (change) => {
    const theirs = changedContent(page.store, change);
    const known = await keelContent(page.store, change.path);
    const body = (text: string | undefined) => {
      if (text === undefined) return '';
      const parsed = parseDocument(text);
      return parsed.ok ? parsed.value.body : text;
    };
    const keel = known === undefined ? undefined : parseDocument(known);
    return { change, version: keel?.ok ? keel.value.header.version : undefined, lines: compactChanges(lineChanges(body(known), body(theirs)), 1) };
  }));

  // Shown also while Handoff is locked (for example after accepting a change put the plan back to draft),
  // so the remaining changes can still be reviewed.
  const readbackCard = (
    <Card title={<span id="readback">Read-back from this folder</span>}
      meta={<>{readback.checked ? `Checked ${when(readback.checked)}` : 'Not checked yet'} · the coding agent&apos;s commits and uncommitted edits to docs/, tasks/ and features/ · {interval === 0 ? 'automatic checks are off' : `every ${interval} second${interval === 1 ? '' : 's'} while Keel runs`} and when you come back to this page</>}
      actions={<form action={checkRepositoryAction}><SubmitButton label="Check now" busyLabel="Checking…" /></form>}>
      <div className={css.stack}>
        {pending.length === 0 ? <p className={css.flat}>No changes from the coding agent.</p> : (
          <>
            <Notice kind="warning" title={`${pending.length} agent change${pending.length === 1 ? '' : 's'} in this folder since handoff`}>
              Review each change. Accepting it creates a new version, with the commit (or Uncommitted) as the reason, and commits it as a Keel commit.
            </Notice>
            <ul aria-label="Pending changes" className={css.changes}>
              {pending.map(({ change, version, lines }) => (
                <li key={change.path} aria-label={change.path} className={css.change}>
                  <div className={css.head}><code>{change.path}</code><span className={css.tags}>{change.commit === WORKING_TREE && <Tag>Uncommitted</Tag>}<Tag tone="warn">Pending</Tag></span></div>
                  <p className={css.flat}>{change.messages.join('; ')}</p>
                  <p className={css.muted}>{change.commit === WORKING_TREE
                    ? `Not committed yet${change.committed ? ` · on top of commit ${change.committed.slice(0, 7)}` : ''}`
                    : `Commit ${change.commit.slice(0, 7)} · ${when(change.date)} · by ${change.author}`}</p>
                  <ol className="changes" aria-label={`Changes to ${change.path}`}>
                    {lines.map((l, i) => l === 'gap' ? <li key={i} className="gap">…</li> : (
                      <li key={i} data-change={l.kind}>{l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '− ' : '  '}{l.text}</li>
                    ))}
                  </ol>
                  <div className={css.row}>
                    <form action={acceptChangeAction}>
                      <input type="hidden" name="path" value={change.path} />
                      <Button type="submit" variant="primary">
                        {version !== undefined ? `Accept as ${change.path.split('/').pop()?.replace('.md', '')} v${version + 1}` : `Accept ${change.path}`}
                      </Button>
                    </form>
                    <form action={dismissChangeAction}>
                      <input type="hidden" name="path" value={change.path} />
                      <Button type="submit" variant="text" title="Puts Keel's last version back">Dismiss</Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div aria-labelledby="ci" className={css.stack}>
          <p id="ci" className={css.muted}>Acceptance scenarios passing in CI, per requirement</p>
          {readback.ci ? (
            <>
              <ul aria-label="Scenario results" className={css.tags}>
                {Object.entries(readback.ci.requirements).map(([req, r]) => (
                  <li key={req}><Tag tone={r.passed === r.total ? 'ok' : r.passed > 0 ? 'warn' : 'neutral'}>{r.passed === r.total ? <Icon name="check" size={16} /> : <Icon name="schedule" size={16} />}{req} · {r.passed} of {r.total}</Tag></li>
                ))}
              </ul>
              <p className={css.muted}>From <a href={readback.ci.url} rel="noopener noreferrer" target="_blank">CI run {readback.ci.run}</a> on {when(readback.ci.date)} · commit {readback.ci.commit.slice(0, 7)}</p>
            </>
          ) : <p className={css.muted}>{readback.ciNote ?? 'No CI results yet.'}</p>}
        </div>
        <CheckOnFocus pending={pending.length} />
      </div>
    </Card>
  );

  const fileRow = (f: PlannedFile): FileRow => ({
    path: f.path, name: f.path.split('/').pop() ?? f.path, kind: STATE[f.state].kind,
    what: f.state === 'conflict' ? (
      <fieldset className={css.choice}>
        <legend className="visually-hidden">What to do with {f.path}</legend>
        <label><input type="radio" name={`choice:${f.path}`} value="mine" defaultChecked form="write-handoff" /> Keep mine</label>
        <label><input type="radio" name={`choice:${f.path}`} value="keel" form="write-handoff" /> Use Keel&apos;s</label>
        <label><input type="radio" name={`choice:${f.path}`} value="beside" form="write-handoff" /> Write as <code>{besidePath(f.path)}</code></label>
      </fieldset>
    ) : (PURPOSE[f.path] ?? ''),
    when: <Tag tone={STATE[f.state].tone}>{STATE[f.state].label}</Tag>,
  });
  const conflicts = planned?.ok ? planned.value.filter((f) => f.state === 'conflict') : [];

  return (
    <StageLayout page={page} error={error} locked={readbackCard}
      meta={`${page.project.id} · handoff · ${page.store.root}`}
      actions={planned?.ok ? <ButtonLink href="/api/handoff" download>Download as zip</ButtonLink> : undefined}>
      <div className={css.stack3}>
        {planned && !planned.ok && <ErrorAlert error={planned.message} />}
        {planned?.ok && (
          <Card title={<span id="package">Files in this folder</span>}
            meta="Your documents are already here. Handoff adds the agent files next to them and commits only those. Keel never overwrites a file it did not write without asking.">
            <div className={css.stack}>
              <p role="status" className={css.muted}>{counts(planned.value)} Checked for keys and tokens: none found.</p>
              <FileTree label="Handoff files" columns={['File', 'What it is for', 'State']} rows={treeOf(planned.value, fileRow)} legend={['new', 'changed', 'conflict', 'kept']} />
            </div>
          </Card>
        )}
        <Card title="Write to this folder" actions={notice || (planned?.ok && planned.value.every((f) => f.state === 'unchanged' || f.state === 'kept')) ? <Tag tone="ok"><Icon name="check" size={16} /> Written</Tag> : <Tag><Icon name="schedule" size={16} /> Not written yet</Tag>}>
          <div className={css.stack}>
            {notice && <Notice kind="success" role="status">{notice}</Notice>}
            {conflicts.map((f) => (
              <Notice key={f.path} kind="warning" title={`${f.path} is already here and Keel did not write it`}>
                Keel never overwrites a file it did not write without asking. Choose Keep mine, Use Keel&apos;s or Write as {besidePath(f.path)} in its row above.
              </Notice>
            ))}
            {planned?.ok && (
              <form id="write-handoff" action={writeHandoffAction} aria-label="Write to folder" className={css.row}>
                <SubmitButton primary label="Write to folder" busyLabel="Writing…" />
                <LinkButton href="/api/handoff">Download as zip</LinkButton>
              </form>
            )}
            <div className={css.push}>
              <div className={css.head}>
                <h3 id="push" className={css.subtitle}>Push (optional)</h3>
                {remote && (
                  <form action={pushAction} aria-label="Push">
                    <SubmitButton label={`Push to origin (${remoteLabel(remote)})`} busyLabel="Pushing…" />
                  </form>
                )}
              </div>
              <p className={css.muted}>{remote ? <>Runs <code>git push origin HEAD</code> with your own git credentials. Keel never pushes on its own.</> : 'No remote. Push from your terminal when you are ready.'}</p>
            </div>
          </div>
        </Card>

        {readbackCard}

        <Card title="Commands" meta="Keel does not know the project's stack. These go into AGENTS.md, the agent kit and CI.">
          <form action={saveHandoffCommandsAction} aria-label="Commands" className={css.grid}>
            {(Object.keys(LABELS) as (keyof Commands)[]).map((key) => (
              <Field key={key} label={LABELS[key]}><input name={key} defaultValue={commands[key]} required /></Field>
            ))}
            <div><Button type="submit">Save commands</Button></div>
          </form>
        </Card>
      </div>
    </StageLayout>
  );
}
