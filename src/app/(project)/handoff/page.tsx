// Handoff stage (mockup: handoff.png): the repository scaffold for any coding agent, as a zip (REQ-006).
import { acceptChangeAction, checkRepositoryAction, dismissChangeAction, pushHandoffAction, saveHandoffCommandsAction } from '../actions';
import { SubmitButton } from '@/components/SubmitButton';
import { hasGithubToken } from '@/lib/github/auth';
import { repositoryOf } from '@/lib/github/push';
import { changedContent, readbackState } from '@/lib/readback/changes';
import { readbackInterval } from '@/lib/readback/schedule';
import { parseDocument, readDocument } from '@/lib/store/documents';
import { compactChanges, lineChanges } from '@/lib/versions/diff';
import { ErrorAlert } from '@/components/Shell';
import { StageLayout } from '@/components/StageBar';
import { buildHandoff, handoffCommands, type Commands } from '@/lib/handoff/scaffold';
import { loadStage, type StageProps } from '../stage';

export const dynamic = 'force-dynamic';

const LABELS: Record<keyof Commands, string> = {
  install: 'Install', run: 'Run the app', test: 'Unit tests', scenarios: 'Acceptance scenarios', verify: 'All checks (CI)',
};

/** Groups package paths by their first folder, for the contents list. */
function grouped(paths: string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const top = path.includes('/') ? `${path.split('/')[0]}/` : 'Root';
    groups.set(top, [...(groups.get(top) ?? []), path]);
  }
  return [...groups.entries()];
}

/** An ISO time as "YYYY-MM-DD HH:MM". */
function when(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

export default async function HandoffPage({ searchParams }: StageProps) {
  const { error, notice } = await (searchParams as Promise<{ error?: string; notice?: string }>);
  const page = await loadStage('handoff');
  const built = page.gate.available ? await buildHandoff(page.store) : undefined;
  const commands = handoffCommands(page.store);
  const repository = repositoryOf(page.store);
  const lastPush = repository?.pushes.at(-1);
  const readback = readbackState(page.store);
  const allowLocal = process.env.KEEL_ALLOW_LOCAL_REMOTES === '1';
  const interval = readbackInterval();
  const pending = await Promise.all(readback.pending.map(async (change) => {
    const theirs = await changedContent(page.store, change);
    const parsed = theirs === undefined ? undefined : parseDocument(theirs);
    const mine = readDocument(page.store, change.path);
    const after = parsed?.ok ? parsed.value.body : (theirs ?? '');
    return { change, mine, lines: compactChanges(lineChanges(mine.ok ? mine.value.body : '', after), 1) };
  }));

  // Shown also while Handoff is locked (for example after accepting a change put the plan back to draft),
  // so the remaining changes can still be reviewed.
  const readbackCard = lastPush ? (
        <section className="card" aria-labelledby="readback">
          <div className="row spread">
            <h2 id="readback">Read-back from repository</h2>
            <form action={checkRepositoryAction}>
              <SubmitButton label="Check now" busyLabel="Checking…" />
            </form>
          </div>
          <p className="muted">
            {readback.checked ? `Checked ${when(readback.checked)}` : 'Not checked yet'} · watching docs/ and tasks/ · {interval === 0 ? 'automatic checks are off' : `every ${interval} minute${interval === 1 ? '' : 's'} while Keel runs`}
          </p>
          {pending.length === 0 ? <p>No changes from the coding agent.</p> : (
            <ul aria-label="Pending changes" className="plain-list">
              {pending.map(({ change, mine, lines }) => (
                <li key={change.path} aria-label={change.path}>
                  <div className="row spread"><code>{change.path}</code><span className="badge warn">Pending</span></div>
                  <p style={{ margin: '6px 0' }}>{change.messages.join('; ')}</p>
                  <p className="muted">Commit {change.commit.slice(0, 7)} · {when(change.date)} · by {change.author}</p>
                  <ol className="changes" aria-label={`Changes to ${change.path}`}>
                    {lines.map((l, i) => l === 'gap' ? <li key={i} className="gap">…</li> : (
                      <li key={i} data-change={l.kind}>{l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '− ' : '  '}{l.text}</li>
                    ))}
                  </ol>
                  <div className="row">
                    <form action={acceptChangeAction}>
                      <input type="hidden" name="path" value={change.path} />
                      <button type="submit" className="primary">
                        {mine.ok ? `Accept as ${change.path.split('/').pop()?.replace('.md', '')} v${mine.value.header.version + 1}` : `Accept ${change.path}`}
                      </button>
                    </form>
                    <form action={dismissChangeAction}>
                      <input type="hidden" name="path" value={change.path} />
                      <button type="submit">Dismiss</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div aria-labelledby="ci" style={{ marginTop: 16 }}>
            <p id="ci" className="muted">Acceptance scenarios passing in CI, per requirement</p>
            {readback.ci ? (
              <>
                <ul aria-label="Scenario results" className="row" style={{ listStyle: 'none', padding: 0, gap: 8 }}>
                  {Object.entries(readback.ci.requirements).map(([req, r]) => (
                    <li key={req} className={`badge ${r.passed === r.total ? 'ok' : r.passed > 0 ? 'warn' : ''}`}>{req} · {r.passed} of {r.total}</li>
                  ))}
                </ul>
                <p className="muted">From <a href={readback.ci.url} rel="noopener noreferrer" target="_blank">CI run {readback.ci.run}</a> on {when(readback.ci.date)} · commit {readback.ci.commit.slice(0, 7)}</p>
              </>
            ) : <p className="muted">{readback.ciNote ?? 'No CI results yet.'}</p>}
          </div>
        </section>
  ) : null;

  return (
    <StageLayout page={page} error={error} locked={readbackCard}
      actions={built?.ok ? <a href={`/api/handoff`} className="button primary" download>Download zip</a> : undefined}>
      <div className="columns">
        <section className="card" aria-labelledby="package">
          <h2 id="package">Handoff package</h2>
          <p className="muted">A repository scaffold any coding agent can build from: instructions, documents, tasks, failing acceptance scenarios, agent kit, standards and CI. No application code.</p>
          {built && !built.ok && <ErrorAlert error={built.message} />}
          {built?.ok && (
            <>
              <p role="status" className="muted">{built.value.length} files. Checked for keys and tokens: none found.</p>
              {grouped(built.value.map((f) => f.path)).map(([group, paths]) => (
                <details key={group} open={group === 'Root'}>
                  <summary>{group} ({paths.length})</summary>
                  <ul aria-label={`Files in ${group}`} className="plain-list mono">
                    {paths.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                </details>
              ))}
            </>
          )}
        </section>
        <div>
        <section className="card" aria-labelledby="destination">
          <div className="row spread">
            <h2 id="destination">Destination</h2>
            {lastPush && <span className="badge ok">Pushed</span>}
          </div>
          {lastPush && (
            <p role="status" className="muted">
              Pushed {lastPush.plan} on {when(lastPush.date)} · commit {lastPush.commit.slice(0, 7)} · {repository?.location} · branch {repository?.branch}
            </p>
          )}
          {notice && <p role="status" className="notice">{notice}</p>}
          <form action={pushHandoffAction} aria-label="Push" className="stack">
            <label>Target <select name="kind" defaultValue={repository?.kind ?? 'github'}>
              <option value="github">GitHub repository</option>
              {allowLocal && <option value="local">Local repository (tests)</option>}
            </select></label>
            <label>Repository <input name="location" defaultValue={repository?.location ?? ''} placeholder="owner/name" required /></label>
            <label>Branch <input name="branch" defaultValue={repository?.branch ?? 'main'} required /></label>
            {!hasGithubToken(page.store) && <p className="muted">Pushing to GitHub needs a token in <a href="/settings">Settings</a>. The repository must exist; an empty one is fine.</p>}
            <div><SubmitButton primary label={lastPush ? 'Push again' : 'Push'} busyLabel="Pushing…" /></div>
          </form>
        </section>

        {readbackCard}

        <form action={saveHandoffCommandsAction} aria-label="Commands" className="card stack">
          <h2>Commands</h2>
          <p className="muted">Keel does not know the project&apos;s stack. These go into AGENTS.md, the agent kit and CI.</p>
          {(Object.keys(LABELS) as (keyof Commands)[]).map((key) => (
            <label key={key}>{LABELS[key]} <input name={key} defaultValue={commands[key]} required /></label>
          ))}
          <div><button type="submit">Save commands</button></div>
        </form>
        </div>
      </div>
    </StageLayout>
  );
}
