// Handoff stage (mockup: handoff.png): the repository scaffold for any coding agent, as a zip (REQ-006).
import { acceptChangeAction, checkRepositoryAction, dismissChangeAction, pushHandoffAction, saveHandoffCommandsAction, writeHandoffAction } from '../actions';
import { SubmitButton } from '@/components/SubmitButton';
import { hasGithubToken } from '@/lib/github/auth';
import { repositoryOf } from '@/lib/github/push';
import { changedContent, keelContent, readbackState, WORKING_TREE } from '@/lib/readback/changes';
import { CheckOnFocus } from '@/components/CheckOnFocus';
import { readbackInterval } from '@/lib/readback/schedule';
import { parseDocument } from '@/lib/store/documents';
import { compactChanges, lineChanges } from '@/lib/versions/diff';
import { ErrorAlert } from '@/components/Shell';
import { StageLayout } from '@/components/StageBar';
import { handoffCommands, type Commands } from '@/lib/handoff/scaffold';
import { besidePath, planHandoff, type FileState, type PlannedFile } from '@/lib/handoff/write';
import { loadStage, type StageProps } from '../stage';

export const dynamic = 'force-dynamic';

const LABELS: Record<keyof Commands, string> = {
  install: 'Install', run: 'Run the app', test: 'Unit tests', scenarios: 'Acceptance scenarios', verify: 'All checks (CI)',
};

const STATE: Record<FileState, { label: string; badge: string }> = {
  new: { label: 'New', badge: 'accent' },
  changed: { label: 'Changed', badge: 'accent' },
  unchanged: { label: 'Unchanged', badge: '' },
  conflict: { label: 'Conflict', badge: 'warn' },
  kept: { label: 'Yours, kept', badge: '' },
};

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
  const repository = repositoryOf(page.store);
  const lastPush = repository?.pushes.at(-1);
  const readback = readbackState(page.store);
  const allowLocal = process.env.KEEL_ALLOW_LOCAL_REMOTES === '1';
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
        <section className="card" aria-labelledby="readback">
          <div className="row spread">
            <h2 id="readback">Read-back from this folder</h2>
            <form action={checkRepositoryAction}>
              <SubmitButton label="Check now" busyLabel="Checking…" />
            </form>
          </div>
          <p className="muted">
            {readback.checked ? `Checked ${when(readback.checked)}` : 'Not checked yet'} · the coding agent&apos;s commits and uncommitted edits to docs/, tasks/ and features/ · {interval === 0 ? 'automatic checks are off' : `every ${interval} second${interval === 1 ? '' : 's'} while Keel runs`} and when you come back to this page
          </p>
          {pending.length === 0 ? <p>No changes from the coding agent.</p> : (
            <ul aria-label="Pending changes" className="plain-list">
              {pending.map(({ change, version, lines }) => (
                <li key={change.path} aria-label={change.path}>
                  <div className="row spread"><code>{change.path}</code><span className="row">{change.commit === WORKING_TREE && <span className="badge">Uncommitted</span>}<span className="badge warn">Pending</span></span></div>
                  <p style={{ margin: '6px 0' }}>{change.messages.join('; ')}</p>
                  <p className="muted">{change.commit === WORKING_TREE
                    ? `Not committed yet${change.committed ? ` · on top of commit ${change.committed.slice(0, 7)}` : ''}`
                    : `Commit ${change.commit.slice(0, 7)} · ${when(change.date)} · by ${change.author}`}</p>
                  <ol className="changes" aria-label={`Changes to ${change.path}`}>
                    {lines.map((l, i) => l === 'gap' ? <li key={i} className="gap">…</li> : (
                      <li key={i} data-change={l.kind}>{l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '− ' : '  '}{l.text}</li>
                    ))}
                  </ol>
                  <div className="row">
                    <form action={acceptChangeAction}>
                      <input type="hidden" name="path" value={change.path} />
                      <button type="submit" className="primary">
                        {version !== undefined ? `Accept as ${change.path.split('/').pop()?.replace('.md', '')} v${version + 1}` : `Accept ${change.path}`}
                      </button>
                    </form>
                    <form action={dismissChangeAction}>
                      <input type="hidden" name="path" value={change.path} />
                      <button type="submit" title="Puts Keel's last version back">Dismiss</button>
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
          <CheckOnFocus pending={pending.length} />
        </section>
  );

  return (
    <StageLayout page={page} error={error} locked={readbackCard}
      actions={planned?.ok ? <a href="/api/handoff" className="button" download>Download as zip</a> : undefined}>
      <div className="columns">
        <section className="card" aria-labelledby="package">
          <h2 id="package">Handoff into this folder</h2>
          <p className="muted">The documents are already in <code>docs/</code> and <code>tasks/</code>. Handoff writes the agent files next to them: instructions, agent kit, standards as skills, failing step stubs and CI. Keel never overwrites a file it did not write without asking.</p>
          {notice && <p role="status" className="notice">{notice}</p>}
          {planned && !planned.ok && <ErrorAlert error={planned.message} />}
          {planned?.ok && (
            <form action={writeHandoffAction} aria-label="Write to folder">
              <p role="status" className="muted">{counts(planned.value)} Checked for keys and tokens: none found.</p>
              <table aria-label="Handoff files">
                <thead><tr><th>File</th><th>State</th></tr></thead>
                <tbody>
                  {planned.value.map((f) => (
                    <tr key={f.path} aria-label={f.path}>
                      <td><code>{f.path}</code></td>
                      <td>
                        <span className={`badge ${STATE[f.state].badge}`}>{STATE[f.state].label}</span>
                        {f.state === 'conflict' && (
                          <fieldset className="bare conflict-choice">
                            <legend className="visually-hidden">What to do with {f.path}</legend>
                            <label><input type="radio" name={`choice:${f.path}`} value="mine" defaultChecked /> Keep mine</label>
                            <label><input type="radio" name={`choice:${f.path}`} value="keel" /> Use Keel&apos;s</label>
                            <label><input type="radio" name={`choice:${f.path}`} value="beside" /> Write as <code>{besidePath(f.path)}</code></label>
                          </fieldset>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row space-above">
                <SubmitButton primary label="Write to folder" busyLabel="Writing…" />
                <a href="/api/handoff" download>Download as zip</a>
              </div>
            </form>
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
