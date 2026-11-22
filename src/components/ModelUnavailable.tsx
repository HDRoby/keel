// Why an action that needs a model is unavailable (REQ-005, REQ-009, CR-0011): Ollama not running or without models.
import Link from 'next/link';
import { Notice } from './ui/Notice';

export function ModelUnavailable({ what, reason }: { what: string; reason: string }) {
  return (
    <Notice kind="warning" role="note" label="Model unavailable" title={`${what} needs a model, and none is available`}>
      {reason} <Link href="/settings">Open Settings</Link>
    </Notice>
  );
}
