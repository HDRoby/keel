// DataTable (docs/ui/keel-components.css grid): a bold header with a dark rule; rows 55 px high with dividers.
import type { ReactNode } from 'react';
import styles from './DataTable.module.css';

export function DataTable({ columns, rows, label, empty }: { columns: ReactNode[]; rows: { key: string; label?: string; cells: ReactNode[]; current?: boolean }[]; label?: string; empty?: ReactNode }) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table} aria-label={label}>
        <thead><tr>{columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && empty ? <tr><td colSpan={columns.length} className={styles.empty}>{empty}</td></tr> : rows.map((r) => (
            <tr key={r.key} aria-label={r.label} className={r.current ? styles.current : undefined}>{r.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
