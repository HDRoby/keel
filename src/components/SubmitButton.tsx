'use client';
// A submit button that says it is busy while its form's action runs (generation can take a while).
import { useFormStatus } from 'react-dom';

export function SubmitButton({ label, busyLabel, primary = false }: { label: string; busyLabel: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={primary ? 'primary' : undefined} disabled={pending}>{pending ? busyLabel : label}</button>;
}
