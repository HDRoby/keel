// Renders Keel's plain markdown as React elements (headings, paragraphs, lists, tables, code blocks,
// **bold**, `code`, [links](url) and REQ IDs). It never injects HTML: text is always escaped by React,
// HTML comments (template guidance) are dropped, and only http(s), relative and #anchor links are kept.
import type { ReactNode } from 'react';

const SAFE_URL = /^(https?:\/\/|\/|#|\.\.?\/|[\w.-]+(\/|$))/i;

/** Inline markdown: `code`, **bold**, [text](url) and REQ-xxx tags. */
export function inline(text: string, key = ''): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\bREQ-\d{3,}\b)/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${at}`;
    const token = m[0];
    if (m[1]) out.push(<code key={k}>{token.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(token.slice(2, -2), k)}</strong>);
    else if (m[3]) {
      const [, label = '', href = ''] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token) ?? [];
      out.push(SAFE_URL.test(href) && !/^javascript:/i.test(href)
        ? <a key={k} href={href} rel="noopener noreferrer" target={/^https?:/.test(href) ? '_blank' : undefined}>{label}</a>
        : label);
    } else out.push(<span key={k} className="req">{token}</span>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

/** Block markdown to elements. */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const key = `b${i}`;
    if (!line.trim()) { i += 1; continue; }
    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      for (i += 1; i < lines.length && !/^```/.test(lines[i] ?? ''); i += 1) body.push(lines[i] ?? '');
      i += 1;
      blocks.push(<pre key={key} className="code">{body.join('\n')}</pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(6, (heading[1]?.length ?? 1) + 1);
      const Tag = `h${level}` as 'h2';
      blocks.push(<Tag key={key}>{inline(heading[2] ?? '', key)}</Tag>);
      i += 1;
      continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i] ?? ''); i += 1) rows.push(cells(lines[i] ?? ''));
      blocks.push(
        <table key={key} className="md-table">
          <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `${key}h${j}`)}</th>)}</tr></thead>
          <tbody>{rows.map((r, n) => <tr key={n}>{r.map((c, j) => <td key={j}>{inline(c, `${key}r${n}c${j}`)}</td>)}</tr>)}</tbody>
        </table>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i] ?? ''); i += 1) items.push((lines[i] ?? '').replace(/^\s*([-*]|\d+\.)\s+/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={key}>{items.map((t, n) => <li key={n}>{inline(t, `${key}i${n}`)}</li>)}</List>);
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && (lines[i] ?? '').trim() && !/^(#{1,6}\s|```|\s*\||\s*([-*]|\d+\.)\s)/.test(lines[i] ?? ''); i += 1) para.push(lines[i] ?? '');
    blocks.push(<p key={key}>{inline(para.join(' '), key)}</p>);
  }
  return <div className="markdown">{blocks}</div>;
}
