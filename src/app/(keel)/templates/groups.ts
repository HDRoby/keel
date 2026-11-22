// The template list on the left of the Templates pages: one group per kind, each template with its version and how
// many documents in this folder use it.
import type { LibraryGroup } from '@/components/LibraryLayout';
import { GROUPS, listTemplates, templateUsage } from '@/lib/templates/library';

export function templateGroups(home: string, current?: string): LibraryGroup[] {
  const templates = listTemplates(home);
  return GROUPS.map(({ group, label }) => ({
    label,
    items: templates.filter((t) => t.group === group).map((t) => {
      const uses = templateUsage(home, t.id).length;
      return {
        href: `/templates/${t.id}`, label: t.name, title: t.name.replace(/ v\d+$/, ''), tag: `v${t.latest}`, current: t.id === current,
        meta: uses ? `Used by ${uses} document${uses === 1 ? '' : 's'}` : 'Not used by any document',
      };
    }),
  }));
}
