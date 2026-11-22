'use client';
// The chat of Discuss a change (REQ-017, CR-0016): messages, the streamed reply with Stop, one message box with Attach
// a file and Send, and "What the assistant can see" with a checkbox per source. A message that looks like a key is
// held here and by the server; it is never sent or saved.
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icons';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { looksLikeKey, KEY_HELD } from '@/lib/discussion/keys';
import css from './discuss.module.css';

export interface ChatMessage { author: string; at: string; text: string; assistant: boolean }
export interface SourceView { id: string; label: string; detail: string; on: boolean }

const MAX_ATTACH = 100 * 1024;

export function Chat(props: {
  id?: string; messages: ChatMessage[]; sources: SourceView[]; waiting: boolean; locked: boolean; prefill?: string;
  starters: { icon: string; label: string; text: string }[]; pulled: string[]; tokens?: { used: number; of: number };
  afterMessages?: ReactNode; side?: ReactNode; sideBottom?: ReactNode;
}) {
  const router = useRouter();
  const [text, setText] = useState(props.prefill ?? '');
  const [ticked, setTicked] = useState(() => new Set(props.sources.filter((s) => s.on).map((s) => s.id)));
  const [attachments, setAttachments] = useState<{ name: string; text: string }[]>([]);
  const [streaming, setStreaming] = useState<{ user: string; reply: string } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [held, setHeld] = useState(false);
  const [tokens, setTokens] = useState(props.tokens);
  const [pulled, setPulled] = useState(props.pulled);
  const abort = useRef<AbortController | undefined>(undefined);
  const id = useRef(props.id);

  async function attach(files: FileList | null) {
    setError(undefined);
    for (const file of Array.from(files ?? [])) {
      if (file.size > MAX_ATTACH) { setError(`${file.name} is larger than 100 KB.`); continue; }
      const content = await file.text();
      if (/(^|\/)(\.env(\..+)?|.*\.(pem|key|p12|pfx)|id_(rsa|dsa|ecdsa|ed25519).*|credentials.*\.json|mcp\.json|\.npmrc|\.netrc)$/i.test(file.name) || looksLikeKey(content)) {
        setError(`${file.name} may contain keys: it cannot be attached.`);
        continue;
      }
      setAttachments((a) => [...a.filter((x) => x.name !== file.name), { name: file.name, text: content }]);
    }
  }

  async function send() {
    const message = text.trim();
    if (!message) return;
    setError(undefined);
    if (looksLikeKey(message) || attachments.some((a) => looksLikeKey(a.text))) { setHeld(true); return; }
    setHeld(false);
    setStreaming({ user: message, reply: '' });
    abort.current = new AbortController();
    try {
      const response = await fetch('/api/discuss', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: abort.current.signal,
        body: JSON.stringify({ op: 'send', ...(id.current ? { id: id.current } : {}), text: message, sources: [...ticked], attachments }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string; held?: string };
        if (data.held) { setHeld(true); setStreaming(undefined); return; }
        throw new Error(data.error ?? 'The message was not sent');
      }
      setText('');
      setAttachments([]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = JSON.parse(buffer.slice(0, end)) as { started?: string; tokens?: number; contextLength?: number; pulled?: string[]; chunk?: string; done?: string; error?: string };
          buffer = buffer.slice(end + 1);
          if (line.started) {
            id.current = line.started;
            if (line.tokens && line.contextLength) setTokens({ used: line.tokens, of: line.contextLength });
            if (line.pulled) setPulled(line.pulled);
          }
          if (line.chunk) setStreaming((s) => (s ? { ...s, reply: s.reply + line.chunk } : s));
          if (line.error) throw new Error(line.error);
          if (line.done) {
            router.replace(`/discuss/${line.done}`);
            router.refresh();
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : 'The message was not sent');
      if (id.current) { router.replace(`/discuss/${id.current}`); router.refresh(); }
    } finally {
      setStreaming(undefined);
      abort.current = undefined;
    }
  }

  const empty = props.messages.length === 0 && !streaming;
  return (
    <div className={css.columns}>
      <div className={css.main}>
        <Card label="Conversation">
          {empty ? (
            <div className={css.empty}>
              <Icon name="forum" size={24} />
              <h2 className={css.emptyTitle}>What would you like to change?</h2>
              <p className={css.muted}>Describe the idea in your own words. The assistant checks it against your requirements, decisions and open change requests, asks what it needs, and proposes a change request when you are ready.</p>
              {props.starters.length > 0 && (
                <div className={css.starters}>
                  {props.starters.map((s) => <button key={s.label} type="button" className={css.starter} onClick={() => setText(s.text)}><Icon name={s.icon} size={16} /> {s.label}</button>)}
                </div>
              )}
            </div>
          ) : (
            <ol className={css.messages} aria-label="Messages">
              {props.messages.map((m, i) => (
                <li key={i} className={m.assistant ? css.assistant : css.user} aria-label={`${m.author} · ${m.at}`}>
                  {m.assistant ? <Markdown text={m.text} /> : <p className={css.userText}>{m.text}</p>}
                </li>
              ))}
              {streaming && (
                <>
                  <li className={css.user}><p className={css.userText}>{streaming.user}</p></li>
                  <li className={css.assistant} aria-busy="true" aria-label="The assistant is answering"><Markdown text={streaming.reply || '…'} /></li>
                </>
              )}
            </ol>
          )}
          {props.afterMessages}
        </Card>
        {!props.locked && (
          <div className={css.composer} id="composer">
            {held && <Notice kind="warning" role="alert" title={KEY_HELD}>Edit the message to remove it. It was not sent and is not saved.</Notice>}
            {error && <Notice kind="danger">{error}</Notice>}
            <label className={css.visuallyHidden} htmlFor="discuss-message">Message</label>
            <textarea id="discuss-message" rows={3} value={text} placeholder="Describe the change, answer a question, or push back" onChange={(e) => { setText(e.target.value); setHeld(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(); }} />
            {attachments.length > 0 && <p className={css.muted}>Attached: {attachments.map((a) => a.name).join(', ')} (sent with this message only)</p>}
            <div className={css.row}>
              <label className={css.attach}><Icon name="attach_file" size={18} /> Attach a file<input type="file" className={css.visuallyHidden} onChange={(e) => { void attach(e.target.files); e.target.value = ''; }} /></label>
              <span className={css.note}>{props.waiting ? 'Typing “yes” creates nothing: use Agree on the proposal' : ''}</span>
              {streaming
                ? <Button small icon={<Icon name="stop" size={18} />} onClick={() => abort.current?.abort()}>Stop</Button>
                : <Button small variant="primary" icon={<Icon name="send" size={18} />} onClick={() => void send()} disabled={!text.trim()}>Send</Button>}
            </div>
          </div>
        )}
      </div>
      <aside className={css.side}>
        {props.side}
        <Card title="What the assistant can see" meta="Keel’s documents and file names. Nothing else unless you attach it.">
          <fieldset className={css.sources} disabled={props.locked}>
            <legend className={css.visuallyHidden}>What the assistant can see</legend>
            {props.sources.map((s) => (
              <label key={s.id} className={css.source}>
                <input type="checkbox" checked={ticked.has(s.id)} aria-label={s.label}
                  onChange={(e) => setTicked((t) => { const next = new Set(t); if (e.target.checked) next.add(s.id); else next.delete(s.id); return next; })} />
                <span><strong>{s.label}</strong><span className={css.muted}> · {s.detail}</span></span>
              </label>
            ))}
          </fieldset>
          <p className={css.note}>{pulled.length ? `Full sections are added when the talk names them: ${pulled.join(', ')} so far.` : 'Full sections are added when the talk names them (REQ, ADR, task or CR IDs).'}</p>
          {tokens && <p className={css.note}>About {Math.round(tokens.used / 1000)}k of {Math.round(tokens.of / 1000)}k tokens used. Older messages are summarised when it gets long.</p>}
        </Card>
        {props.sideBottom}
      </aside>
    </div>
  );
}
