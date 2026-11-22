// The spec's design as decision topics (REQ-013, task R12), kept in .keel/design.json: the topics of the spec
// template (and any the assistant added for a requirement), the options proposed for each, and the choice.
// The assistant never changes a decision; it may comment on a topic when a requirement changes.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { writeFileAtomic } from '../store/atomic';

export const DESIGN_FILE = '.keel/design.json';

const fitSchema = z.object({ kind: z.enum(['follows', 'breaks', 'conflicts', 'adds-concern']), text: z.string().max(500) });
export const optionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  summary: z.string().max(500).default(''),
  pro: z.string().max(300).default(''),
  con: z.string().max(300).default(''),
  serves: z.array(z.string().regex(/^REQ-\d{3,}$/)).default([]),
  fit: fitSchema.optional(),
  recommended: z.boolean().default(false),
  reason: z.string().max(500).optional(),   // why it is recommended
});
const topicSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  guidance: z.string().default(''),
  origin: z.enum(['template', 'assistant']).default('template'),
  reasonAdded: z.string().optional(),       // "Added by the assistant for REQ-007"
  options: z.array(optionSchema).max(3).default([]),
  chosen: z.string().optional(),            // an option id, or "own"
  own: z.object({ name: z.string().min(1).max(200), summary: z.string().max(500).default(''), fit: fitSchema.optional() }).optional(),
  reason: z.string().max(2_000).optional(),
  record: z.string().optional(),            // docs/decisions/NNNN-<topic>.md
  comment: z.string().max(500).optional(),
});
const designSchema = z.object({
  topics: z.array(topicSchema).default([]),
  pending: z.object({ change: z.string(), topic: z.string(), chosen: z.string(), own: topicSchema.shape.own, reason: z.string() }).optional(),
});

export type Fit = z.infer<typeof fitSchema>;
export type DesignOption = z.infer<typeof optionSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Design = z.infer<typeof designSchema>;

export function readDesign(root: string): Design {
  try {
    const parsed = designSchema.safeParse(JSON.parse(readFileSync(join(root, DESIGN_FILE), 'utf8')));
    return parsed.success ? parsed.data : { topics: [] };
  } catch {
    return { topics: [] };
  }
}

export function writeDesign(root: string, design: Design): void {
  mkdirSync(join(root, '.keel'), { recursive: true });
  writeFileAtomic(join(root, DESIGN_FILE), `${JSON.stringify(design, null, 2)}\n`);
}

export const topicId = (title: string) => title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'topic';

/** The decision topics a spec template declares in its front matter (`decision_topics`). None for older templates. */
export function templateTopics(templateContent: string): { title: string; guidance: string }[] {
  try {
    const parsed = z.array(z.object({ title: z.string().min(1), guidance: z.string().default('') })).safeParse(matter(templateContent, {}).data.decision_topics);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** The option chosen for a topic (the user's own when "own"). */
export function chosenOption(topic: Topic): { name: string; summary: string; fit?: Fit } | undefined {
  if (topic.chosen === 'own') return topic.own;
  return topic.options.find((o) => o.id === topic.chosen);
}

/** The topics still to decide: the plan waits for them (REQ-005). */
export function undecided(root: string): string[] {
  if (!existsSync(join(root, DESIGN_FILE))) return [];
  return readDesign(root).topics.filter((t) => !chosenOption(t)).map((t) => t.title);
}
