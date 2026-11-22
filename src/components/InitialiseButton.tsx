'use client';
// The primary button on Initialise follows the path (CR-0010): "Initialise and draft the baseline" for an existing
// project recorded first, "Initialise and start brainstorm" otherwise.
import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { Button } from './ui/Button';

export function InitialiseButton({ formId, baseline }: { formId: string; baseline: boolean }) {
  const [draft, setDraft] = useState(baseline);
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const update = () => setDraft(new FormData(form).get('path') === 'baseline');
    form.addEventListener('change', update);
    return () => form.removeEventListener('change', update);
  }, [formId]);
  return <Button type="submit" variant="primary" icon={<Icon name={draft ? 'description' : 'forum'} size={18} />}>{draft ? 'Initialise and draft the baseline' : 'Initialise and start brainstorm'}</Button>;
}
