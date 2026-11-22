// Running the AI readiness check (CR-0015): scan, rules and mapping locally, then the model review of each area,
// then the report, saved. Runs only when the user asks; never when a folder opens.
import { basename } from 'node:path';
import type { Writer } from '../generate/writer';
import { effectiveChoice } from '../providers/local';
import { PROVIDERS } from '../providers/types';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/store';
import { isInitialised, readProject } from '../store/workspace';
import { mapAgentFiles } from './mapping';
import { buildReport, ignoredAdvice, nextReportId, saveReport, type ReadinessReport } from './report';
import { reviewAreas, tickedTexts } from './review';
import { localReader, readinessScan, runRules, type Area } from './rules';

export type Progress = { step: 'scan' } | { step: 'review'; area: Area; index: number } | { step: 'save' };

/** The model the report uses: the Feasibility review model, as "Provider · model". */
export async function readinessModel(store: Store): Promise<string> {
  const choice = await effectiveChoice(store, 'feasibility');
  const provider = PROVIDERS.find((p) => p.id === choice.provider)?.label ?? choice.provider;
  return choice.model ? `${provider} · ${choice.model}` : provider;
}

export async function runReadiness(store: Store, options: { ticked: string[] }, write: Writer, onProgress?: (p: Progress) => void): Promise<Result<{ report: ReadinessReport; path: string }, 'failed'>> {
  const started = Date.now();
  onProgress?.({ step: 'scan' });
  const scan = readinessScan(store.root);
  const read = localReader(store.root);
  const results = runRules(scan, read);
  const mapping = mapAgentFiles(scan, read);
  const files = scan.kase === 'new' ? [] : tickedTexts(scan, options.ticked);
  const review = scan.kase === 'new' ? { answers: {} } : await reviewAreas(write, scan, results, files, (area, index) => onProgress?.({ step: 'review', area, index }));
  const project = isInitialised(store.root) ? readProject(store.root) : undefined;
  const now = store.now?.() ?? new Date();
  const report = buildReport({
    scan, results, mapping, review, model: scan.kase === 'new' ? '' : await readinessModel(store), durationMs: Date.now() - started,
    read: files.map((f) => f.path), ignored: ignoredAdvice(store), lineCount: (path) => read(path)?.split('\n').length,
    now, id: nextReportId(store, now), title: project?.ok ? project.value.title : basename(store.root),
  });
  onProgress?.({ step: 'save' });
  const saved = await saveReport(store, report);
  return saved.ok ? ok({ report, path: saved.value }) : fail('failed', saved.message);
}
