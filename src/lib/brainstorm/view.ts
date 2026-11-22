// What the Explore page shows of the state (task R10), shared by the page and /api/explore.
import { progress } from './review';
import { requiredFilled, sectionOf, type Comment, type Context, type Origin, type ThreadEntry } from './session';

export interface SectionView {
  key: string;
  required: boolean;
  list: boolean;
  guidance: string;
  value: string;
  rows?: { id?: string; text: string; origin: Origin }[];
  origin: Origin;
  cleared: boolean;
  comment?: Comment;
  commentAt?: string;
  thread: ThreadEntry[];
}

export interface ExploreView {
  sections: SectionView[];
  reviewedAt?: string;
  filled: number;
  required: number;
  canDraft: boolean;
}

export function exploreView(context: Context): ExploreView {
  const { filled, required } = progress(context);
  return {
    sections: context.sections.map((t) => {
      const s = sectionOf(context.state, t.heading, t.list);
      return {
        key: t.heading, required: t.required, list: t.list, guidance: t.guidance,
        value: s.value, ...(s.rows ? { rows: s.rows } : t.list ? { rows: [] } : {}),
        origin: s.origin, cleared: Boolean(s.cleared), ...(s.comment ? { comment: s.comment } : {}),
        ...(s.commentAt ? { commentAt: s.commentAt } : {}), thread: s.thread,
      };
    }),
    ...(context.state.reviewedAt ? { reviewedAt: context.state.reviewedAt } : {}),
    filled, required, canDraft: requiredFilled(context),
  };
}
