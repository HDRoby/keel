'use client';
// Checks the folder for the coding agent's changes when the window gets focus, then refreshes the page
// if the number of pending changes moved (task R6). Coming back from the editor shows what changed.
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function CheckOnFocus({ pending }: { pending: number }) {
  const router = useRouter();
  useEffect(() => {
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch('/api/readback', { method: 'POST' });
        const body = (await response.json().catch(() => ({}))) as { pending?: number };
        if (response.ok && body.pending !== pending) router.refresh();
      } finally {
        busy = false;
      }
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [pending, router]);
  return null;
}
