// The style list on the left of the Brainstorm styles pages.
import type { LibraryGroup } from '@/components/LibraryLayout';
import { listStyles } from '@/lib/brainstorm/styles';

export function styleGroups(home: string, current?: string): LibraryGroup[] {
  const item = (s: ReturnType<typeof listStyles>[number], first: boolean) => ({ href: `/styles/${s.id}`, label: `${s.name} v${s.version}`, title: s.name, tag: `${first ? 'Default · ' : ''}v${s.version}`, meta: s.description, current: s.id === current });
  const discussion = listStyles(home, 'discussion');
  return [
    { label: 'Brainstorm styles', items: listStyles(home).map((s, i) => item(s, i === 0)) },
    // Discuss a change (CR-0016).
    ...(discussion.length ? [{ label: 'Discussion styles', items: discussion.map((s, i) => item(s, i === 0)) }] : []),
  ];
}
