import { describe, expect, it } from 'vitest';
import { placeholders, renderTemplate } from './render';

const template = '---\ntemplate: t@1\nkind: intent\n---\n\n# Intent: {{title}}\n\n## Problem\n<!-- required -->\nFor {{ project_id }} and {{title}}, see {{plan_path}}.\n';

describe('render', () => {
  it('lists placeholders once, in order', () => {
    expect(placeholders(template)).toEqual(['title', 'project_id', 'plan_path']);
  });

  it('drops front matter, fills values, keeps guidance and reports what is missing', () => {
    const rendered = renderTemplate(template, { title: 'Keel', project_id: 'PRJ-0001' });
    expect(rendered.body).toBe('# Intent: Keel\n\n## Problem\n<!-- required -->\nFor PRJ-0001 and Keel, see {{plan_path}}.\n');
    expect(rendered.missing).toEqual(['plan_path']);
  });
});
