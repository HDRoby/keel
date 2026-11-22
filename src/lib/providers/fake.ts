// Scripted provider for tests (KEEL_PROVIDER=fake). Says which provider it stands in for.
// For an Explore review (a system prompt asking for JSON) it answers with a scripted review keyed on the
// sections' content, so the scenarios are deterministic. KEEL_FAKE_LOG names a file that gets one line per
// call, so a scenario can check that no model call was made.
import { appendFileSync } from 'node:fs';
import { PROVIDERS, type ChatMessage, type ChatProvider, type RealProviderId } from './types';

const REVIEW_MARKER = 'Answer with one JSON object and nothing else.';
const SCENARIO_MARKER = 'Answer with one scenario as JSON and nothing else.';
const DESIGN_MARKER = 'Answer with the design topics as JSON and nothing else.';
const BASELINE_MARKER = 'Answer with the baseline as JSON and nothing else.';
const STARTUP_MARKER = 'Keel startup check: answer briefly.';

export function fakeReply(standsFor: RealProviderId, messages: ChatMessage[]): string {
  const label = PROVIDERS.find((p) => p.id === standsFor)?.label ?? standsFor;
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  if (messages[0]?.role === 'system' && messages[0].content.includes(REVIEW_MARKER)) return JSON.stringify(fakeReview(label, last));
  if (messages[0]?.role === 'system' && messages[0].content.includes(SCENARIO_MARKER)) return JSON.stringify(fakeFailureCase(last));
  if (messages[0]?.role === 'system' && messages[0].content.includes(DESIGN_MARKER)) return JSON.stringify(fakeDesign(last));
  if (messages[0]?.role === 'system' && messages[0].content.includes(BASELINE_MARKER)) return JSON.stringify(fakeBaseline(last));
  if (messages[0]?.role === 'system' && messages[0].content.includes('Answer with a fit line as JSON and nothing else.')) return JSON.stringify({ kind: 'follows', text: 'Fits the requirements; no standard is broken' });
  return `Reply from ${label}: I read "${last}".`;
}

interface SectionView {
  section: string;
  text?: string;
  rows?: { text: string; by: string }[];
  by?: string;
  cleared?: boolean;
}

/** A review that depends only on the sections: who wrote what, and how many words the list has. */
export function fakeReview(label: string, userMessage: string): Record<string, unknown> {
  let input: { sections?: SectionView[]; replyTo?: { key: string; text: string } } = {};
  try {
    input = JSON.parse(userMessage) as typeof input;
  } catch {
    return { comments: {} };
  }
  const sections = input.sections ?? [];
  const byUser = (s: SectionView | undefined) => (s?.by === 'user' ? (s.text ?? '').trim() : '');
  const find = (name: string) => sections.find((s) => s.section === name);
  const words = sections.flatMap((s) => (s.rows ? s.rows.filter((r) => r.by === 'user').map((r) => r.text) : [byUser(s)])).join(' ').split(/\s+/).filter(Boolean).length;
  const audience = byUser(find('Who it is for')).toLowerCase();
  const outcome = byUser(find('Desired outcome'));
  const comments: Record<string, unknown> = {};
  const suggestions: Record<string, unknown> = {};
  for (const s of sections) {
    const text = byUser(s);
    if (s.rows) {
      const rows = s.rows;
      if (rows.length === 0 && outcome && !s.cleared) {
        suggestions[s.section] = ['Record an expense in under a minute', 'See the team\'s expenses by month', 'Export the expenses to CSV'];
        comments[s.section] = { kind: 'suggest', text: `Suggestion from ${label}: three rows drawn from Desired outcome. Accept the ones you want.` };
      } else if (rows.length === 0) {
        comments[s.section] = { kind: 'ask', text: 'What must the first version do? One short, testable row each.' };
      } else {
        comments[s.section] = { kind: 'ok', text: `Looks good (${label}). The list has ${words} words so far.`, addRow: 'Keep a history of changes to each expense' };
      }
    } else if (s.section === 'Constraints' && audience.includes('product manager') && !text.toLowerCase().includes('web ui')) {
      comments[s.section] = {
        kind: 'link', linkTo: 'Who it is for',
        text: 'Who it is for includes product managers, who will not install developer tools. Add a web UI as a constraint?',
        rewrite: `${text ? `${text} ` : ''}A web UI, so product managers can use it without installing anything.`,
      };
    } else if (s.section === 'Problem' && text && text.length < 60) {
      comments[s.section] = { kind: 'challenge', text: 'Who is affected, and how often? A number would make this testable.', rewrite: `${text} It happens every week and costs the team hours.` };
    } else if (!text && s.by !== 'user' && (s.text ?? '').trim()) {
      comments[s.section] = { kind: 'suggest', text: 'This is a suggestion. Accept it if it fits, or clear it.' };
    } else if (!text && s.section === 'Desired outcome' && !s.cleared) {
      suggestions[s.section] = 'Every expense is recorded within a day of spending it.';
      comments[s.section] = { kind: 'suggest', text: 'A suggestion to start from. Accept it if it fits, or clear it.' };
    } else if (!text) {
      comments[s.section] = { kind: 'ask', text: `What would you write under ${s.section}?` };
    } else {
      comments[s.section] = { kind: 'ok', text: `Looks good (${label}). The list has ${words} words so far.` };
    }
  }
  const reply = input.replyTo ? { text: `Reply from ${label}: I read "${input.replyTo.text}".` } : undefined;
  return { comments, suggestions, ...(reply ? { reply } : {}) };
}

/** A failure scenario for the requirement in the message, for "Suggest a failure case". */
export function fakeFailureCase(userMessage: string): Record<string, unknown> {
  let requirement = { id: 'REQ-000', statement: 'the requirement' };
  try {
    requirement = (JSON.parse(userMessage) as { requirement: typeof requirement }).requirement;
  } catch {
    // keep the default
  }
  const what = requirement.statement.charAt(0).toLowerCase() + requirement.statement.slice(1);
  return {
    name: `${requirement.statement} is refused when the input is not valid`,
    steps: [
      { keyword: 'Given', text: 'the input is not valid' },
      { keyword: 'When', text: `I try to ${what}` },
      { keyword: 'Then', text: 'I see why it was refused, and nothing is saved' },
    ],
  };
}

/** Design options per topic, from a fixed catalogue; fit lines follow the standards in the message. */
export function fakeDesign(userMessage: string): Record<string, unknown> {
  let input: { topics?: { title: string }[]; standards?: { ref: string; name: string }[]; code?: { stack?: string } } = {};
  try {
    input = JSON.parse(userMessage) as typeof input;
  } catch {
    return { topics: [] };
  }
  const ts = input.standards?.find((s) => s.ref.startsWith('typescript-conventions@'));
  const option = (name: string, summary: string, pro: string, con: string, recommended = false, fit?: { kind: string; text: string }) => ({ name, summary, pro, con, serves: [], recommended, ...(recommended ? { reason: 'Fits the requirements and the standards best.' } : {}), ...(fit ? { fit } : {}) });
  const catalogue: Record<string, unknown[]> = {
    Form: [option('Local web app', 'A server on 127.0.0.1 opened in the browser.', 'Works on any computer with a browser.', 'Needs a running process.', true), option('Desktop app (Electron)', 'A packaged desktop application.', 'Feels native.', 'Large download.'), option('Command-line tool', 'A terminal program.', 'Simple to ship.', 'Hard for non-engineers.')],
    'Language and framework': [
      option('TypeScript with Next.js', 'One language for the UI and the server.', 'Typed end to end.', 'A framework to keep up with.', true, ts ? { kind: 'follows', text: `Follows ${ts.name} v${ts.ref.split('@')[1]}` } : undefined),
      option('Plain JavaScript with Express', 'A small server and hand-written pages.', 'Few dependencies.', 'No types.', false, ts ? { kind: 'breaks', text: `Breaks ${ts.name} v${ts.ref.split('@')[1]}: the code must be TypeScript` } : undefined),
      option('Python with FastAPI', 'A Python server with a separate front end.', 'Strong data libraries.', 'Two languages.'),
    ],
    Storage: [option('Markdown in git with a SQLite index', 'Documents as files; an index for search.', 'Readable without the tool.', 'Two places to keep in step.', true), option('SQLite only', 'Everything in one database file.', 'Simple queries.', 'Not readable in git.'), option('Postgres', 'A database server.', 'Scales to many users.', 'A server to run.', false, { kind: 'adds-concern', text: 'Needs a database server and its credentials' })],
    'Model access': [option('One provider interface (Anthropic, OpenAI, Ollama)', 'Adapters behind one interface.', 'Any model per task.', 'More code to test.', true), option('Anthropic only', 'One SDK.', 'Least code.', 'Locked to one vendor.'), option('Local models only (Ollama)', 'No keys, no network.', 'Private and free.', 'Weaker models.')],
    Testing: [option('Vitest, Playwright and playwright-bdd', 'Unit tests and Gherkin scenarios in the browser.', 'Scenarios run as written.', 'Browser tests are slower.', true), option('Jest and Cypress', 'Common pair.', 'Familiar.', 'Gherkin needs a plugin.'), option('Manual testing', 'A checklist.', 'No setup.', 'Nothing runs in CI.')],
  };
  return { topics: (input.topics ?? []).map((t) => ({ title: t.title, options: catalogue[t.title] ?? [option(`Option for ${t.title}`, 'A sensible default.', 'Simple.', 'Generic.', true)] })) };
}

/** A baseline from the shared files: the README's first paragraph as the problem, its bullets as requirements. */
export function fakeBaseline(userMessage: string): Record<string, unknown> {
  let input: { sections?: string[]; files?: { path: string; text: string }[] } = {};
  try {
    input = JSON.parse(userMessage) as typeof input;
  } catch {
    return { sections: {}, requirements: [] };
  }
  const readme = input.files?.find((f) => /^readme/i.test(f.path))?.text ?? '';
  const paragraph = readme.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#') && !/^[-*]/.test(p)) ?? '';
  const bullets = readme.split('\n').map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1]?.trim()).filter((l): l is string => Boolean(l)).slice(0, 6);
  const sections: Record<string, string> = {};
  if (paragraph && input.sections?.includes('Problem')) sections.Problem = paragraph;
  if (input.sections?.includes('Desired outcome')) sections['Desired outcome'] = 'Keep what works today, and plan the next change on top of it.';
  return { sections, requirements: bullets };
}

export function createFakeProvider(standsFor: RealProviderId, env: Record<string, string | undefined> = process.env): ChatProvider {
  return {
    id: 'fake',
    async *stream(messages) {
      const log = env.KEEL_FAKE_LOG?.trim();
      if (log) appendFileSync(log, `${new Date().toISOString()} ${standsFor} ${messages[0]?.content.includes(REVIEW_MARKER) ? 'review' : messages[0]?.content.includes(SCENARIO_MARKER) ? 'scenario' : messages[0]?.content.includes(DESIGN_MARKER) ? 'design' : messages[0]?.content.includes(BASELINE_MARKER) ? 'baseline' : messages[0]?.content.includes(STARTUP_MARKER) ? 'health' : 'chat'}\n`);
      for (const word of fakeReply(standsFor, messages).split(/(?<= )/)) yield word;
    },
  };
}
