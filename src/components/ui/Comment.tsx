// Comment (docs/ui-guide.md): a 3 px left border and soft background in the kind's colour, an overline with the
// kind, the text, optional proposed text in a white dashed box with its actions, a reply thread and input.
// Collapsed: a one-line preview with "Show".
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Comment.module.css';

export type CommentKind = 'challenge' | 'link' | 'suggest' | 'question' | 'ok';
export const COMMENT_LABEL: Record<CommentKind, string> = { challenge: 'Challenge', link: 'Links sections', suggest: 'Suggestion', question: 'Question', ok: 'Looks good' };

export interface CommentProps {
  kind: CommentKind;
  overline?: ReactNode;          // defaults to the kind's label, e.g. "Links sections · Problem"
  label?: string;
  collapsed?: ReactNode;         // the preview line and its Show control, instead of the body
  proposed?: ReactNode;
  proposedActions?: ReactNode;
  thread?: ReactNode;
  reply?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Comment({ kind, overline, label, collapsed, proposed, proposedActions, thread, reply, actions, children }: CommentProps) {
  return (
    <div className={cx(styles.comment, styles[kind])} aria-label={label} role={label ? 'note' : undefined} data-kind={kind}>
      <div className={styles.overline}>{overline ?? COMMENT_LABEL[kind]}</div>
      {collapsed ? <div className={styles.preview}>{collapsed}</div> : (
        <>
          {children && <div className={styles.text}>{children}</div>}
          {proposed && (
            <div className={styles.proposed}>
              <div>{proposed}</div>
              {proposedActions && <div className={styles.actions}>{proposedActions}</div>}
            </div>
          )}
          {thread}
          {reply}
          {actions && <div className={styles.actions}>{actions}</div>}
        </>
      )}
    </div>
  );
}

/** A reply thread under a comment: the user's replies on the right. */
export function Thread({ children }: { children: ReactNode }) {
  return <ul className={styles.thread}>{children}</ul>;
}
export function ThreadItem({ from, children }: { from: 'user' | 'assistant'; children: ReactNode }) {
  return <li className={cx(styles.item, from === 'user' && styles.user)}>{children}</li>;
}
