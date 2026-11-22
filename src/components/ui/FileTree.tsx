// FileTree (docs/ui-guide.md): a grid of path / what it is for / when. Rows padded 6 x 16 on alternating
// backgrounds; folders bold with a chevron and a file count when closed, and they start closed; a colour dot per
// kind with a legend. Folders are <details>, so they open without script.
import type { ReactNode } from 'react';
import { Icon } from '../Icons';
import { cx } from './cx';
import styles from './FileTree.module.css';

export type FileKind = 'plain' | 'dependent' | 'ignored' | 'new' | 'changed' | 'conflict' | 'kept';
export interface FileRow { path: string; name: string; what: ReactNode; when?: ReactNode; kind?: FileKind; children?: FileRow[]; open?: boolean }

const KIND_LABEL: Record<FileKind, string> = { plain: 'Always', dependent: 'Depends on a choice', ignored: 'Not in git', new: 'New', changed: 'Changed', conflict: 'Conflict', kept: 'Kept' };

const countFiles = (row: FileRow): number => (row.children ? row.children.reduce((n, c) => n + countFiles(c), 0) : 1);

function Row({ row, depth }: { row: FileRow; depth: number }) {
  const kind = row.kind ?? 'plain';
  const cells = (folder: boolean) => (
    <>
      <span className={styles.path} data-depth={depth}>
        {folder ? <span className={styles.chevron}><Icon name="chevron_right" size={16} /></span> : <span className={styles.spacer} />}
        <span className={cx(styles.dot, styles[kind])} aria-hidden="true" />
        <code className={cx(folder && styles.folder)}>{row.name}</code>
        {folder && <span className={styles.count}>{countFiles(row)} files</span>}
      </span>
      <span className={styles.what}>{row.what}</span>
      <span className={styles.when}>{row.when}</span>
    </>
  );
  if (!row.children) return <div role="row" className={cx(styles.row, styles[`d${Math.min(depth, 4)}`])} data-kind={kind} aria-label={row.path}>{cells(false)}</div>;
  return (
    <details className={styles.group} open={row.open} data-kind={kind}>
      <summary role="row" className={cx(styles.row, styles[`d${Math.min(depth, 4)}`])} aria-label={row.path}>{cells(true)}</summary>
      {row.children.map((c) => <Row key={c.path} row={c} depth={depth + 1} />)}
    </details>
  );
}

export function FileTree({ rows, label, legend = [], columns = ['Path', 'What it is for', 'When'] }: { rows: FileRow[]; label?: string; legend?: FileKind[]; columns?: [string, string, string] }) {
  return (
    <div className={styles.tree} role="table" aria-label={label}>
      <div role="row" className={cx(styles.row, styles.header)}>{columns.map((c) => <span key={c} role="columnheader">{c}</span>)}</div>
      {rows.map((r) => <Row key={r.path} row={r} depth={0} />)}
      {legend.length > 0 && (
        <div className={styles.legend}>
          {legend.map((k) => <span key={k}><span className={cx(styles.dot, styles[k])} aria-hidden="true" /> {KIND_LABEL[k]}</span>)}
        </div>
      )}
    </div>
  );
}
