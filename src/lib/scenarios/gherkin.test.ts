import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFeature, parseFeatureDoc, requirementsOf, warnings } from './gherkin';

const sample = `@area
Feature: Brainstorm

  Explore shows the intent template's sections.
  The assistant comments on each one.

  Background:
    Given a project

  @REQ-001 @smoke
  Scenario: Sections have comments
    Given a template
    When I open Explore
    Then each section has a comment
      | section |
      | Problem |

  @REQ-002
  Scenario Outline: Many
    Given <n> sections
    * one more

    Examples:
      | n |
      | 3 |
`;

describe('parseFeatureDoc and buildFeature', () => {
  it('reads the feature, background, tags, steps, tables and examples', () => {
    const doc = parseFeatureDoc(sample);
    expect(doc).toMatchObject({ tags: ['@area'], name: 'Brainstorm', description: ["Explore shows the intent template's sections.", 'The assistant comments on each one.'], background: ['Background:', 'Given a project'] });
    expect(doc.scenarios[0]).toEqual({ tags: ['@REQ-001', '@smoke'], name: 'Sections have comments', steps: [
      { keyword: 'Given', text: 'a template' }, { keyword: 'When', text: 'I open Explore' },
      { keyword: 'Then', text: 'each section has a comment', extra: ['| section |', '| Problem |'] },
    ] });
    expect(doc.scenarios[1]).toMatchObject({ outline: true, steps: [{ keyword: 'Given' }, { keyword: 'And', text: 'one more' }], examples: ['Examples:', '| n |', '| 3 |'] });
    expect(requirementsOf(doc.scenarios[0] as never, doc)).toEqual(['REQ-001']);
  });

  it('builds the same text back', () => {
    expect(buildFeature(parseFeatureDoc(sample))).toBe(sample.replace('* one more', 'And one more'));
  });

  it('keeps every feature file of this repository the same after a round trip, apart from layout', () => {
    for (const file of readdirSync(join(process.cwd(), 'features')).filter((f) => f.endsWith('.feature'))) {
      const text = readFileSync(join(process.cwd(), 'features', file), 'utf8');
      const doc = parseFeatureDoc(text);
      expect(parseFeatureDoc(buildFeature(doc)), file).toEqual(doc);
      expect(doc.scenarios.length, file).toBeGreaterThan(0);
    }
  });

  it('warns softly when a scenario has no Then or several Whens', () => {
    expect(warnings({ steps: [{ keyword: 'Given', text: 'a' }, { keyword: 'When', text: 'b' }] })).toEqual(['No Then step: say what the scenario proves.']);
    expect(warnings({ steps: [{ keyword: 'When', text: 'a' }, { keyword: 'When', text: 'b' }, { keyword: 'Then', text: 'c' }] })).toEqual(['More than one When: one behaviour per scenario where possible.']);
  });
});
