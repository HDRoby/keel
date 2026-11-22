'use client';
// Settings › Model per task: the provider, and the model. With Ollama the model is a drop-down of every model on this
// computer (a datalist would only suggest names matching the one already chosen); other providers take a name.
import { useState } from 'react';
import { Field } from '@/components/ui/Field';

export function ModelChoiceFields({ providers, provider, model, local }: {
  providers: { id: string; label: string }[]; provider: string; model: string; local: { name: string; parameters: string }[];
}) {
  const [chosen, setChosen] = useState(provider);
  const ollama = chosen === 'ollama' && local.length > 0;
  const installed = local.some((m) => m.name === model);
  return (
    <>
      <Field label="Provider">
        <select name="provider" value={chosen} onChange={(e) => setChosen(e.target.value)}>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Field>
      {ollama ? (
        <Field label="Model">
          <select key="ollama" name="model" defaultValue={installed ? model : model ? model : (local[0]?.name ?? '')} required>
            {!installed && model && <option value={model}>{model} (not installed)</option>}
            {local.map((m) => <option key={m.name} value={m.name}>{m.name}{m.parameters ? ` · ${m.parameters}` : ''}</option>)}
          </select>
        </Field>
      ) : (
        <Field label="Model"><input key="other" name="model" defaultValue={chosen === provider ? model : ''} placeholder="Model name" required /></Field>
      )}
    </>
  );
}
