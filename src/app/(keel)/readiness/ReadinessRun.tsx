'use client';
// Run the check (REQ-016, CR-0015): the files the model may read, with a tick each (files that may hold keys cannot be
// ticked), what will be sent, and Run the check; then the progress of each step until the report is saved.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/Icons';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import css from './readiness.module.css';

export interface ReadableFile { path: string; ticked: boolean; blocked: boolean }
type Step = { label: string; state: 'wait' | 'now' | 'done' };

const AREAS = ['Agent instructions', 'Project knowledge', 'Verification', 'Conventions', 'Agent tooling', 'Safety'];

export function ReadinessRun({ files, withModel }: { files: ReadableFile[]; withModel: boolean }) {
  const router = useRouter();
  const [ticked, setTicked] = useState(() => new Set(files.filter((f) => f.ticked && !f.blocked).map((f) => f.path)));
  const [steps, setSteps] = useState<Step[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  const labels = ['Scan the folder (names only, no model)', ...(withModel ? AREAS : []), 'Check every advice against the scan'];
  const progress = (index: number) => setSteps(labels.map((label, i) => ({ label, state: i < index ? 'done' : i === index ? 'now' : 'wait' })));

  async function run() {
    setError(undefined);
    progress(0);
    try {
      const response = await fetch('/api/readiness', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticked: [...ticked] }) });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'The check could not start');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = JSON.parse(buffer.slice(0, end)) as { step?: string; index?: number; done?: string; error?: string };
          buffer = buffer.slice(end + 1);
          if (line.step === 'review' && typeof line.index === 'number') progress(line.index + 1);
          if (line.step === 'save') progress(labels.length - 1);
          if (line.error) throw new Error(line.error);
          if (line.done) {
            router.replace(`/readiness?report=${line.done}`);
            router.refresh();
            return;
          }
        }
      }
      throw new Error('The check stopped before the report was saved');
    } catch (e) {
      setSteps(undefined);
      setError(e instanceof Error ? e.message : 'The check failed');
    }
  }

  if (steps) {
    return (
      <div className={css.stack} role="status" aria-label="Checking">
        <ol className={css.steps}>
          {steps.map((s) => (
            <li key={s.label} className={css.step} data-state={s.state}>
              <Icon name={s.state === 'done' ? 'check_circle' : s.state === 'now' ? 'progress_activity' : 'radio_button_unchecked'} size={20} />
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
        <p className={css.muted}>You can leave this page; the report is saved when it finishes.</p>
      </div>
    );
  }

  const sendable = files.filter((f) => !f.blocked && ticked.has(f.path)).length;
  return (
    <div className={css.stack}>
      {error && <Notice kind="danger" title="The check did not run">{error}</Notice>}
      {files.length > 0 ? (
        <fieldset className={css.files}>
          <legend className={css.legend}>Files the model may read</legend>
          <p className={css.muted}>Without a tick, only the file name is sent.</p>
          {files.map((f) => (
            <label key={f.path} className={css.file}>
              <input type="checkbox" aria-label={f.path} disabled={f.blocked} checked={!f.blocked && ticked.has(f.path)}
                onChange={(e) => setTicked((t) => { const next = new Set(t); if (e.target.checked) next.add(f.path); else next.delete(f.path); return next; })} />
              <code>{f.path}</code>
              {f.blocked && <span className={css.blocked}>May contain keys: never sent</span>}
            </label>
          ))}
        </fieldset>
      ) : withModel ? <Notice kind="info" title="Nothing to read in this folder">The check runs on file names only.</Notice> : null}
      {withModel && (
        <p className={css.sent}><Icon name="upload" size={18} /> <span>Sent to the model: <strong>file and folder names</strong>{sendable > 0 && <> and <strong>{sendable} {sendable === 1 ? 'item' : 'items'} you ticked</strong></>}. Never keys, .env files or files you did not tick.</span></p>
      )}
      <div className={css.row}>
        <Button variant="primary" icon={<Icon name="play_arrow" size={18} />} onClick={run}>Run the check</Button>
        <span className={css.muted}>{withModel ? `${AREAS.length} short calls, one per area` : 'No model call for an empty folder'}</span>
      </div>
    </div>
  );
}
