// The CR-0011 comparison (CR-0013, task R19 step 6): raise the change behind CR-0011 ("Ollama is the default
// provider") in a project whose code map is this repository's own file names, plan it and write the package, then
// compare it with the hand-written changes/CR-0011/. Used by the test and by scripts/compare-cr-0011.ts.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Writer } from '../generate/writer';
import type { Store } from '../store/db';
import { createDocument, readDocument } from '../store/documents';
import { commitFiles } from '../store/git';
import { initialiseProject } from '../store/workspace';
import { requirementStatements } from '../trace/parse';
import { draftChange } from './draft';
import { packageFiles, writePackage } from './flow';
import { planChange, readPlan, settlePlannedScenario } from './plan';
import { createChange, readChange } from './store';

export interface Comparison { generated: { request: string; prompt: string; tasks: { id: string; files: string[] }[]; scenarios: number }; handWritten: { sections: string[]; files: string[] }; report: string[] }

const sections = (text: string) => [...text.matchAll(/^## (.+)$/gm)].map((m) => (m[1] ?? '').trim());
const paths = (text: string) => [...new Set([...text.matchAll(/`((?:src|seed|bin|features|docs)\/[\w./@-]+)`/g)].map((m) => m[1] ?? ''))];

export async function compareCr0011(store: Store, repo: string, write: Writer): Promise<Comparison> {
  await initialiseProject(store, { title: 'Keel', author: 'Ada' });
  // The code map: this repository's tracked file names, as empty files (only names are read).
  const tracked = execFileSync('git', ['ls-files', 'src', 'seed', 'bin'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const path of tracked) {
    mkdirSync(join(store.root, path, '..'), { recursive: true });
    writeFileSync(join(store.root, path), '');
  }
  await commitFiles(store.root, ['src', 'seed', 'bin'], 'Code');
  const spec = readDocument({ ...store, root: repo } as Store, 'docs/spec.md');
  const statement = spec.ok ? requirementStatements(spec.value.body)['REQ-009'] ?? 'Any model provider' : 'Any model provider';
  await createDocument(store, { kind: 'intent', title: 'Keel', template: 'standard-intent@3', status: 'approved', body: `## Requirements\n\n- REQ-009 ${statement}\n` });

  const title = 'Ollama is the default provider, with the local models listed';
  const reason = 'Keel should work out of the box, privately and for free, on the computer it runs on. Today the default provider is Anthropic, and the local option is a generic OpenAI-compatible entry with no list of models.';
  const draft = await draftChange(write, { title, reason, requirements: ['REQ-009'] });
  const made = await createChange(store, { title, reason, status: 'approved', size: 'significant', requirements: ['REQ-009'], affects: ['SPC-0001@12'], impact: [], draft });
  if (!made.ok) throw new Error(made.message);
  const planned = await planChange(store, made.value.id, {}, write);
  if (!planned.ok) throw new Error(planned.message);
  for (const s of planned.value.scenarios) await settlePlannedScenario(store, made.value.id, s.id, 'accepted');
  await writePackage(store, made.value.id);
  const cr = readChange(store.root, made.value.id);
  const files = cr ? packageFiles(store, cr) : [];
  const plan = readPlan(store.root, made.value.id);
  const request = cr ? readFileSync(join(store.root, cr.file), 'utf8') : '';
  const prompt = files.find((f) => f.path.endsWith('PROMPT.md'))?.content ?? '';

  const hand = readFileSync(join(repo, 'changes', 'CR-0011', 'CR-0011.md'), 'utf8');
  const handTask = readFileSync(join(repo, 'changes', 'CR-0011', 'tasks', 'R16.md'), 'utf8');
  const handFiles = paths(handTask);
  const genFiles = [...new Set((plan?.tasks ?? []).flatMap((t) => t.files))];
  const report = [
    `Request sections: generated ${sections(request).join(', ')}; hand-written ${sections(hand).join(', ')}.`,
    `Prompt: ${prompt.split('\n').filter((l) => /^\d\. /.test(l)).length} numbered steps (hand-written CR-0011: ${readFileSync(join(repo, 'changes', 'CR-0011', 'PROMPT.md'), 'utf8').split('\n').filter((l) => /^\d\. /.test(l)).length}).`,
    `Tasks: generated ${(plan?.tasks ?? []).map((t) => t.id).join(', ')}; hand-written R16.`,
    `Files likely to change: generated ${genFiles.join(', ') || 'none'}; hand-written R16 names ${handFiles.join(', ')}.`,
    `Files in both: ${genFiles.filter((f) => handFiles.includes(f)).join(', ') || 'none'}.`,
    `Scenarios: generated ${plan?.scenarios.length ?? 0} (accepted); hand-written providers-ollama.feature has ${(readFileSync(join(repo, 'changes', 'CR-0011', 'features', 'providers-ollama.feature'), 'utf8').match(/Scenario:/g) ?? []).length}.`,
  ];
  return { generated: { request, prompt, tasks: (plan?.tasks ?? []).map((t) => ({ id: t.id, files: t.files })), scenarios: plan?.scenarios.length ?? 0 }, handWritten: { sections: sections(hand), files: handFiles }, report };
}
