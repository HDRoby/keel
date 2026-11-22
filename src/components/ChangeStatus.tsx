// The computed status of a change request as a tag (CR-0003): waiting and blocked in warning colours, ready and
// applied in success colours, in progress in accent, rejected and unreadable in danger.
import type { ComputedStatus as Status } from '@/lib/changes/store';
import { Tag, type TagTone } from './ui/Tag';

const TONE: Record<Status['kind'], TagTone> = {
  unreadable: 'danger', rejected: 'danger', draft: 'neutral', waiting: 'warn', blocked: 'warn', ready: 'ok', progress: 'accent', applied: 'ok',
};

export function ChangeStatus({ status }: { status: Status }) {
  return <Tag tone={TONE[status.kind]}>{status.label}</Tag>;
}
