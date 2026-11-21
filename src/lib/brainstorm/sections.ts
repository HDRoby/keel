// Reads an intent template's sections and fills them with brainstorm answers (REQ-001).
import matter from 'gray-matter';

export interface Section {
  heading: string;
  required: boolean;
  guidance: string;
}

export type Answers = Record<string, string[]>;

export interface Question {
  section: string;
  step: 'ask' | 'probe';
}

const SECTION = /^## (.+)\n(?:<!--\s*(required|optional)\s*(?:·\s*(.*?))?\s*-->)?/gm;

/** The "## " sections of a template, with the required/optional marker and guidance from its comment. */
export function parseSections(content: string): Section[] {
  const body = matter(content, {}).content;
  return [...body.matchAll(SECTION)].map((m) => ({
    heading: (m[1] ?? '').trim(),
    required: m[2] === 'required',
    guidance: (m[3] ?? '').trim(),
  }));
}

export function isCaptured(answers: Answers, heading: string): boolean {
  return (answers[heading] ?? []).some((a) => a.trim() !== '');
}

/** True when every required section has an answer: the intent can be drafted. */
export function requiredCaptured(sections: Section[], answers: Answers): boolean {
  return sections.filter((s) => s.required).every((s) => isCaptured(answers, s.heading));
}

/**
 * What to ask after an answer. Each section gets a question, then one probe in the chosen style;
 * then the next missing required section, then the optional ones. Undefined when all are covered.
 */
export function nextQuestion(sections: Section[], answers: Answers, answered?: Question): Question | undefined {
  if (answered?.step === 'ask') return { section: answered.section, step: 'probe' };
  const missing = sections.filter((s) => !isCaptured(answers, s.heading));
  const next = missing.find((s) => s.required) ?? missing[0];
  return next && { section: next.heading, step: 'ask' };
}

/** Puts each section's answers under its heading. Sections without an answer keep their guidance comment. */
export function fillSections(body: string, answers: Answers): string {
  return body.replace(/^## (.+)\n(<!--[^\n]*-->\n)?(?:(?!## )[^\n]*\n?)*/gm, (whole, heading: string) => {
    const text = (answers[heading.trim()] ?? []).map((a) => a.trim()).filter(Boolean).join('\n\n');
    return text ? `## ${heading}\n\n${text}\n\n` : whole;
  });
}

/**
 * Adds text at the end of one section of a document, leaving the rest as it is. A section that still
 * has only its guidance comment gets the text in place of the comment; a missing section is added at the end.
 */
export function appendToSection(body: string, heading: string, text: string): string {
  const start = body.search(new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \t]*$`, 'm'));
  if (start < 0) return `${body.trimEnd()}\n\n## ${heading}\n\n${text}\n`;
  const afterHeading = body.indexOf('\n', start) + 1 || body.length;
  const next = body.slice(afterHeading).search(/^## /m);
  const end = next < 0 ? body.length : afterHeading + next;
  const content = body.slice(afterHeading, end).replace(/^<!--[^\n]*-->\n?/, '').trim();
  const section = `${body.slice(start, afterHeading)}\n${content ? `${content}\n\n` : ''}${text}\n${next < 0 ? '' : '\n'}`;
  return body.slice(0, start) + section + body.slice(end);
}
