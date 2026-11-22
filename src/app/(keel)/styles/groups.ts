// The style list on the left of the Brainstorm styles pages.
import type { LibraryGroup } from '@/components/LibraryLayout';
import { listStyles } from '@/lib/brainstorm/styles';

export function styleGroups(home: string, current?: string): LibraryGroup[] {
  return [{
    label: 'Brainstorm styles',
    items: listStyles(home).map((s, i) => ({ href: `/styles/${s.id}`, label: `${s.name} v${s.version}`, title: s.name, tag: `${i === 0 ? 'Default · ' : ''}v${s.version}`, meta: s.description, current: s.id === current })),
  }];
}
