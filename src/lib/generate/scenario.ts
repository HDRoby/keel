// "Suggest a failure case" (REQ-004, task R11): asks the model for one failure scenario for a requirement. The
// answer is validated (a name, steps with allowed keywords) and added as a suggestion; it counts once accepted.
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/store';
import { KEYWORDS } from '../scenarios/gherkin';
import { addSuggestions, coverage, type Suggestion } from '../scenarios/store';
import type { Writer } from './writer';

/** In the system prompt; the fake provider looks for it to answer with a scenario. */
export const SCENARIO_MARKER = 'Answer with one scenario as JSON and nothing else.';

const answerSchema = z.object({
  name: z.string().trim().min(1).max(300),
  steps: z.array(z.object({ keyword: z.enum(KEYWORDS), text: z.string().trim().min(1).max(500) })).min(2).max(15),
});

export async function suggestFailureCase(store: Store, req: string, write: Writer): Promise<Result<Suggestion, 'not-found' | 'invalid-answer' | 'no-model'>> {
  const requirement = coverage(store.root).find((r) => r.id === req);
  if (!requirement) return fail('not-found', `${req} is not a requirement of the spec`);
  const text = await write('documents', [
    {
      role: 'system',
      content: [
        `Write one acceptance scenario for ${req} that covers a failure or an edge case: what happens when it goes wrong.`,
        'Describe behaviour, not clicks. One When where possible, and a Then that says what is proved. Do not repeat the existing scenarios.',
        SCENARIO_MARKER,
        'Format: {"name": "...", "steps": [{"keyword": "Given" | "When" | "Then" | "And" | "But", "text": "..."}]}',
      ].join('\n'),
    },
    { role: 'user', content: JSON.stringify({ requirement: { id: req, statement: requirement.statement }, scenarios: requirement.accepted.map((s) => ({ name: s.name, steps: s.steps })) }) },
  ]);
  if (text === undefined) return fail('no-model', 'No model is available to suggest a scenario');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  try {
    const parsed = answerSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!parsed.success) return fail('invalid-answer', 'The assistant did not answer with a scenario');
    const [made] = await addSuggestions(store, [{ req, name: parsed.data.name, steps: parsed.data.steps, kind: 'failure' }], `Scenarios: suggested failure case for ${req}`);
    return made ? ok(made) : fail('invalid-answer', 'The suggestion could not be saved');
  } catch {
    return fail('invalid-answer', 'The assistant did not answer with a scenario');
  }
}
