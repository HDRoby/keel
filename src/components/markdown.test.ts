import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe('Markdown', () => {
  it('renders headings one level down, lists, tables and code, and drops comments', () => {
    const out = html('# Intent: Keel\n\n## Problem\n<!-- required · guide -->\nOne\nline.\n\n- REQ-001 **Bold** `x`\n- Two\n\n| ID | Text |\n| --- | --- |\n| REQ-002 | A \\| B |\n\n```gherkin\nFeature: X\n```\n');
    expect(out).toBe('<div class="markdown"><h2>Intent: Keel</h2><h3>Problem</h3><p>One line.</p>'
      + '<ul><li><span class="req">REQ-001</span> <strong>Bold</strong> <code>x</code></li><li>Two</li></ul>'
      + '<table class="md-table"><thead><tr><th>ID</th><th>Text</th></tr></thead><tbody><tr><td><span class="req">REQ-002</span></td><td>A | B</td></tr></tbody></table>'
      + '<pre class="code">Feature: X</pre></div>');
  });

  it('escapes HTML and keeps only safe links', () => {
    const out = html('<script>alert(1)</script> [ok](https://example.com) [bad](javascript:alert(1)) [rel](mock-001-a.png)');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('<a href="https://example.com" rel="noopener noreferrer" target="_blank">ok</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('<a href="mock-001-a.png" rel="noopener noreferrer">rel</a>');
  });

  it('renders _emphasis_ but not underscores inside words, and marks lists of requirements', () => {
    expect(html('_Not written yet._ snake_case_name')).toBe('<div class="markdown"><p><em>Not written yet.</em> snake_case_name</p></div>');
    expect(html('- REQ-001 One\n- REQ-002 Two\n')).toContain('<ul class="req-list">');
  });
});
