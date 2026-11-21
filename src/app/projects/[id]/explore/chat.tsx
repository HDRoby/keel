'use client';
// Brainstorm chat: the proposer's messages in a light bubble on the right, the assistant's as plain text.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Send } from '@/components/Icons';

export interface ChatEntry {
  role: 'user' | 'assistant';
  text: string;
}

interface Props {
  slug: string;
  transcript: ChatEntry[];
  asking?: string;       // section of the open question
  pending: boolean;      // the question has not been asked yet
}

export function Chat({ slug, transcript, asking, pending }: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState(transcript);
  const [synced, setSynced] = useState(transcript);
  // Take the saved transcript after a refresh, without remounting (which would clear a half-typed answer).
  if (synced !== transcript) {
    setSynced(transcript);
    setEntries(transcript);
  }
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const started = useRef(false);

  async function turn(text?: string) {
    setBusy(true);
    const shown: ChatEntry[] = text ? [...entries, { role: 'user', text }] : [...entries];
    setEntries(shown);
    const response = await fetch(`/api/projects/${slug}/brainstorm`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(text ? { answer: text } : {}),
    });
    if (response.body && response.status === 200) {
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let reply = '';
      for (let r = await reader.read(); !r.done; r = await reader.read()) {
        reply += r.value;
        setEntries([...shown, { role: 'assistant', text: reply }]);
      }
    }
    setBusy(false);
    router.refresh();
  }

  useEffect(() => {
    if (pending && !started.current) {
      started.current = true;
      void turn();
    }
  });

  function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    const text = answer.trim();
    if (!text || busy) return;
    setAnswer('');
    void turn(text);
  }

  return (
    <section aria-label="Brainstorm">
      <ol className="chat">
        {entries.map((e, i) => <li key={i} className={e.role}>{e.text}</li>)}
      </ol>
      {asking && <p role="status" aria-live="polite" className="muted">Asking about: {asking}</p>}
      {asking && (
        <form onSubmit={submit} className="composer">
          <label htmlFor="answer" className="visually-hidden">Your answer</label>
          <textarea id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} disabled={busy}
            placeholder="Answer the question" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }} />
          <button type="submit" className="icon primary" aria-label="Send" title="Send (Ctrl or Cmd + Enter)" disabled={busy || !answer.trim()}><Send /></button>
        </form>
      )}
    </section>
  );
}
