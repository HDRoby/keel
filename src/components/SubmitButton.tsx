'use client';
// A submit button that says it is busy while its form's action runs (generation can take a while).
import { useFormStatus } from 'react-dom';
import { Button } from './ui/Button';

export function SubmitButton({ label, busyLabel, primary = false }: { label: string; busyLabel: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={primary ? 'primary' : 'outline'} disabled={pending}>{pending ? busyLabel : label}</Button>;
}
