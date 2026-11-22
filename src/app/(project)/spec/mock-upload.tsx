'use client';
// Attach the result (REQ-010, task R14): choose the exported PNG files and their HTML sources, or paste a link to
// the live prototype. Keel matches each file to a screen from its name, here in the browser, and asks for a screen
// where it cannot; nothing is sent until Save.
import { useMemo, useState } from 'react';
import { saveMockSetAction } from './mock-actions';
import css from './spec.module.css';
import { Icon } from '@/components/Icons';
import { SubmitButton } from '@/components/SubmitButton';
import { Field } from '@/components/ui/Field';
import { Tag } from '@/components/ui/Tag';
import { matchFiles, type Screen } from '@/lib/mocks/match';

export function MockUpload({ screens, nextSet, specVersion }: { screens: Screen[]; nextSet: number; specVersion: number }) {
  const [names, setNames] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});   // base name → screen number
  const matched = useMemo(() => matchFiles(names, screens), [names, screens]);
  const choiceJson = JSON.stringify(Object.fromEntries(Object.entries(choices).flatMap(([key, number]) => {
    const screen = screens.find((s) => s.number === number);
    return screen ? [[key, { screen: screen.name, number: screen.number, reqs: screen.reqs }]] : [];
  })));
  const counts = { name: matched.filter((m) => m.match === 'name').length, check: matched.filter((m) => m.match === 'check').length, none: matched.filter((m) => m.match === 'none' && !choices[m.key]).length };
  return (
    <form action={saveMockSetAction} aria-label="Attach the result" className={css.stack}>
      <label className={css.drop}>
        <Icon name="upload_file" size={24} tone="muted" />
        <span className={css.dropTitle}>Choose the exported PNG files, with their HTML sources if you have them</span>
        <span className={css.muted}>Keel matches each file to a screen and its requirements from the file name. The files are never sent to a model.</span>
        <input type="file" name="files" multiple accept=".png,.html,.htm,image/png,text/html" aria-label="Exported files"
          onChange={(e) => setNames([...(e.target.files ?? [])].map((f) => f.name))} />
      </label>
      <Field label="Or a link to the live prototype" optional><input name="link" type="url" placeholder="https://" /></Field>
      <input type="hidden" name="choices" value={choiceJson} />
      {matched.length > 0 && (
        <>
          <p role="status" className={css.muted}>{names.length} file{names.length === 1 ? '' : 's'} chosen. {counts.name} matched from their names{counts.check ? `; ${counts.check} to check` : ''}{counts.none ? `; ${counts.none} not matched yet` : ''}.</p>
          <table className={css.matchTable} aria-label="Matched files">
            <thead><tr><th>File</th><th>Screen</th><th>Requirements</th><th>Match</th></tr></thead>
            <tbody>
              {matched.map((m) => {
                const chosen = screens.find((s) => s.number === choices[m.key]);
                return (
                  <tr key={m.key} aria-label={m.files[0]}>
                    <td><code>{m.files.join(' + ')}</code></td>
                    <td>
                      {m.match === 'none' ? (
                        <select aria-label={`Choose a screen for ${m.files[0]}`} value={choices[m.key] ?? ''} onChange={(e) => setChoices((c) => ({ ...c, [m.key]: e.target.value }))}>
                          <option value="">Not matched</option>
                          {screens.map((s) => <option key={s.number} value={s.number}>{s.number} · {s.name}</option>)}
                        </select>
                      ) : <>{m.number} · {m.screen}</>}
                    </td>
                    <td>{(chosen?.reqs ?? m.reqs).join(', ') || '—'}</td>
                    <td><Tag tone={m.match === 'name' ? 'ok' : m.match === 'check' || chosen ? 'warn' : 'danger'}>{chosen ? 'Chosen by you' : m.note}</Tag></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      <div className={css.row}>
        <SubmitButton primary label={`Save as mock set ${nextSet} (spec v${specVersion})`} busyLabel="Saving…" />
        <span className={css.muted}>Saved to docs/mocks/set-{nextSet}/, with a README listing each screen, its requirements, the spec version and the export date.</span>
      </div>
    </form>
  );
}
