// FileTree (docs/ui-guide.md): a grid of path / what it is for / when. Rows padded 6 x 16 on alternating
// backgrounds; folders bold with a chevron and a file count when closed, and they start closed; a colour dot per
// kind with a legend. Folders are <details>, so they open without script.
import type { ReactNode } from 'react';
import { Icon } from '../Icons';
import { cx } from './cx';
import styles from './FileTree.module.css';

export type FileKind = 'plain' | 'dependent' | 'ignored' | 'new' | 'changed' | 'conflict' | 'kept';
export interface FileRow { path: string; name: string; what: ReactNode; when?: ReactNode; kind?: FileKind; children?: FileRow[]; open?: boolean }

const KIND_LABEL: Record<FileKind, string> = { plain: 'Always created', dependent: 'Depends on your selection (zero to many)', ignored: 'Not in git', new: 'New', changed: 'Changed', conflict: 'Conflict', kept: 'Kept' };

const countFiles = (row: FileRow): number => (row.children ? row.children.reduce((n, c) => n + countFiles(c), 0) : 1);

interface Control { isOpen?: (path: string) => boolean; onToggle?: (path: string, open: boolean) => void }

function Row({ row, depth, control }: { row: FileRow; depth: number; control: Control }) {
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
    <details className={styles.group} open={control.isOpen ? control.isOpen(row.path) : row.open} data-kind={kind}
      onToggle={control.onToggle ? (e) => control.onToggle?.(row.path, e.currentTarget.open) : undefined}>
      <summary role="row" className={cx(styles.row, styles[`d${Math.min(depth, 4)}`])} aria-label={row.path}>{cells(true)}</summary>
      {row.children.map((c) => <Row key={c.path} row={c} depth={depth + 1} control={control} />)}
    </details>
  );
}

export function FileTree({ rows, label, legend = [], legendExtra, columns = ['Path', 'What it is for', 'When'], headerActions, isOpen, onToggle }: {
  rows: FileRow[]; label?: string; legend?: FileKind[]; legendExtra?: ReactNode; columns?: [string, string, string]; headerActions?: ReactNode;
} & Control) {
  return (
    <div className={styles.tree} role="table" aria-label={label}>
      <div role="row" className={cx(styles.row, styles.header)}>{columns.map((c, i) => <span key={c} role="columnheader">{c}{i === 0 && headerActions ? <span className={styles.headerActions}>{headerActions}</span> : null}</span>)}</div>
      {rows.map((r) => <Row key={r.path} row={r} depth={0} control={{ isOpen, onToggle }} />)}
      {(legend.length > 0 || legendExtra) && (
        <div className={styles.legend}>
          {legend.map((k) => <span key={k}><span className={cx(styles.dot, styles[k])} aria-hidden="true" /> {KIND_LABEL[k]}</span>)}
          {legendExtra}
        </div>
      )}
    </div>
  );
}
