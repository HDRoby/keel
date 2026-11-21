// Document model shared by the store, templates, gates and traceability (tasks T1, T2, T5, T6).

export type DocumentKind = 'intent' | 'spec' | 'plan' | 'roadmap' | 'decision' | 'task' | 'change';

// Tasks use todo, doing and done (task template); other documents draft, pending, approved and closed.
export type DocumentStatus = 'draft' | 'pending' | 'approved' | 'closed' | 'todo' | 'doing' | 'done';

export interface DocumentHeader {
  id: string;          // e.g. INT-0001
  project: string;     // e.g. PRJ-0001
  title: string;
  author: string;
  created: string;     // ISO date
  updated: string;     // ISO date
  status: DocumentStatus;
  version: number;
  template: string;    // e.g. standard-intent@3
  [extra: string]: unknown;
}

export interface KeelDocument {
  kind: DocumentKind;
  header: DocumentHeader;
  body: string;        // plain markdown (Plain markdown standard)
}

export type Stage = 'explore' | 'intent' | 'spec' | 'plan' | 'handoff';
