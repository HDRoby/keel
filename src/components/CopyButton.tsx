'use client';
// Copies a text (a change request's PROMPT.md) to the clipboard, for pasting into the coding agent.
import { useState } from 'react';
import { Icon } from './Icons';
import { Button } from './ui/Button';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button disabled={!text} icon={<Icon name={copied ? 'check' : 'content_copy'} size={18} />}
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false)); }}>
      {copied ? 'Copied' : label}
    </Button>
  );
}
