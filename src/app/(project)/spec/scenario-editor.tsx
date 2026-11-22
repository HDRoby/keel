'use client';
// Edit mode for one scenario (mock source Spec.dc.html › Acceptance scenarios): the name, each step as a keyword and
// text, add and remove steps, Done. The @REQ tag comes from the requirement group, so it cannot be wrong.
import { useState } from 'react';
import { saveScenarioAction } from './scenario-actions';
import css from './spec.module.css';
import { Icon } from '@/components/Icons';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { LinkButton } from '@/components/ui/LinkButton';
import { StepRow } from '@/components/ui/ScenarioCard';
import { KEYWORDS, warnings, type Keyword, type Step } from '@/lib/scenarios/gherkin';

export function ScenarioEditor({ req, id, name: initialName, steps: initialSteps }: { req: string; id?: string; name: string; steps: Step[] }) {
  const [name, setName] = useState(initialName);
  const [steps, setSteps] = useState<Step[]>(initialSteps.length ? initialSteps : [{ keyword: 'Given', text: '' }, { keyword: 'When', text: '' }, { keyword: 'Then', text: '' }]);
  const set = (i: number, change: Partial<Step>) => setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...change } : s)));
  const soft = warnings({ steps: steps.filter((s) => s.text.trim()) });
  return (
    <form action={saveScenarioAction} aria-label={`Edit scenario for ${req}`} className={css.stack}>
      <input type="hidden" name="scenario" value={JSON.stringify({ ...(id ? { id } : {}), req, name, steps })} />
      <Field label="Scenario"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="What behaviour it proves" required /></Field>
      <ol className={css.stack} aria-label="Steps">
        {steps.map((s, i) => (
          <li key={i}>
            <StepRow>
              <select aria-label={`Step ${i + 1} keyword`} value={s.keyword} onChange={(e) => set(i, { keyword: e.target.value as Keyword })}>
                {KEYWORDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <input aria-label={`Step ${i + 1} text`} value={s.text} onChange={(e) => set(i, { text: e.target.value })} />
              <Button variant="text" small aria-label={`Remove step ${i + 1}`} onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}><Icon name="close" size={18} /></Button>
            </StepRow>
          </li>
        ))}
      </ol>
      <div className={css.row}><LinkButton onClick={() => setSteps((all) => [...all, { keyword: 'And', text: '' }])}>+ Add step</LinkButton></div>
      {soft.length > 0 && <p className={css.muted} role="note">{soft.join(' ')}</p>}
      <div className={css.row}>
        <Button type="submit" variant="primary">Done</Button>
        <LinkButton href={`/spec?tab=scenarios#${req}`} tone="muted">Cancel</LinkButton>
      </div>
    </form>
  );
}
