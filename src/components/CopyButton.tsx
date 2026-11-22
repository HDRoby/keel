'use client';
// Copies a text (a change request's PROMPT.md) to the clipboard, for pasting into the coding agent.
import { useState } from 'react';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" disabled={!text} onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false)); }}>
      {copied ? 'Copied' : label}
    </button>
  );
}
