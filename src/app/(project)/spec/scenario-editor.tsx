'use client';
// Edit mode for one scenario (mockup: Spec › Acceptance scenarios): the name, each step as a keyword and text,
// add and remove steps, Done. The @REQ tag comes from the requirement group, so it cannot be wrong.
import Link from 'next/link';
import { useState } from 'react';
import { saveScenarioAction } from './scenario-actions';
import { KEYWORDS, warnings, type Keyword, type Step } from '@/lib/scenarios/gherkin';

export function ScenarioEditor({ req, id, name: initialName, steps: initialSteps }: { req: string; id?: string; name: string; steps: Step[] }) {
  const [name, setName] = useState(initialName);
  const [steps, setSteps] = useState<Step[]>(initialSteps.length ? initialSteps : [{ keyword: 'Given', text: '' }, { keyword: 'When', text: '' }, { keyword: 'Then', text: '' }]);
  const set = (i: number, change: Partial<Step>) => setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...change } : s)));
  const soft = warnings({ steps: steps.filter((s) => s.text.trim()) });
  return (
    <form action={saveScenarioAction} aria-label={`Edit scenario for ${req}`} className="scenario-editor stack">
      <input type="hidden" name="scenario" value={JSON.stringify({ ...(id ? { id } : {}), req, name, steps })} />
      <label>Scenario <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What behaviour it proves" required /></label>
      <ol className="plain-list stack" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={i} className="step-row">
            <select aria-label={`Step ${i + 1} keyword`} value={s.keyword} onChange={(e) => set(i, { keyword: e.target.value as Keyword })}>
              {KEYWORDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input aria-label={`Step ${i + 1} text`} value={s.text} onChange={(e) => set(i, { text: e.target.value })} />
            <button type="button" className="icon" aria-label={`Remove step ${i + 1}`} onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
      </ol>
      <div className="row">
        <button type="button" className="link" onClick={() => setSteps((all) => [...all, { keyword: 'And', text: '' }])}>+ Add step</button>
      </div>
      {soft.length > 0 && <p className="muted small" role="note">{soft.join(' ')}</p>}
      <div className="row">
        <button type="submit" className="primary">Done</button>
        <Link href={`/spec?tab=scenarios#${req}`}>Cancel</Link>
      </div>
    </form>
  );
}
