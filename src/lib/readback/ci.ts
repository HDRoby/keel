// Acceptance scenario results per requirement from CI (REQ-007, T9; owner decision): read the bdd-results
// artifact (test-results/bdd.json) of the latest workflow run on the pushed branch. Needs "Actions: read".
import { z } from 'zod';
import { readZip } from '../handoff/zip';
import { fail, ok, type Result } from '../result';

export const ARTIFACT = 'bdd-results';

export interface RequirementResult {
  passed: number;
  total: number;
}

export interface CiResults {
  run: number;            // workflow run id
  url: string;            // the run on github.com
  commit: string;
  date: string;
  requirements: Record<string, RequirementResult>;
}

export type CiError = 'no-run' | 'no-artifact' | 'not-allowed' | 'ci-failed';

interface Spec {
  tags?: string[];
  ok?: boolean;
}
interface Suite {
  specs?: Spec[];
  suites?: Suite[];
}

/** Passed and total scenarios per REQ tag, from Playwright's JSON report (playwright-bdd puts tags on specs). */
export function resultsByRequirement(report: unknown): Record<string, RequirementResult> {
  const results: Record<string, RequirementResult> = {};
  const visit = (suite: Suite) => {
    for (const spec of suite.specs ?? []) {
      for (const tag of new Set((spec.tags ?? []).map((t) => t.replace(/^@/, '')).filter((t) => /^REQ-\d{3,}$/.test(t)))) {
        const entry = (results[tag] ??= { passed: 0, total: 0 });
        entry.total += 1;
        if (spec.ok) entry.passed += 1;
      }
    }
    (suite.suites ?? []).forEach(visit);
  };
  const suites = (report as { suites?: Suite[] } | null)?.suites;
  if (Array.isArray(suites)) suites.forEach(visit);
  return Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b)));
}

const runsSchema = z.object({ workflow_runs: z.array(z.object({ id: z.number(), html_url: z.string(), head_sha: z.string(), created_at: z.string(), status: z.string() })) });
const artifactsSchema = z.object({ artifacts: z.array(z.object({ id: z.number(), name: z.string(), expired: z.boolean() })) });

type Fetch = (url: string, init: { headers: Record<string, string>; redirect?: 'follow' }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

/**
 * The results of the latest finished CI run on the branch. `fetchImpl` is replaceable for tests.
 * The token is only sent to api.github.com, in the Authorization header.
 */
export async function fetchCiResults(repo: string, branch: string, token: string, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<Result<CiResults, CiError>> {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) return fail('ci-failed', 'Not a GitHub repository');
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  const api = `https://api.github.com/repos/${repo}`;
  try {
    const runsResponse = await fetchImpl(`${api}/actions/runs?branch=${encodeURIComponent(branch)}&status=completed&per_page=1`, { headers });
    if (runsResponse.status === 403 || runsResponse.status === 404) return fail('not-allowed', 'The token cannot read Actions on this repository (needs "Actions: read")');
    if (!runsResponse.ok) return fail('ci-failed', `GitHub answered ${runsResponse.status}`);
    const run = runsSchema.parse(await runsResponse.json()).workflow_runs[0];
    if (!run) return fail('no-run', 'No finished CI run on this branch yet');
    const artifactsResponse = await fetchImpl(`${api}/actions/runs/${run.id}/artifacts`, { headers });
    if (!artifactsResponse.ok) return fail('ci-failed', `GitHub answered ${artifactsResponse.status}`);
    const artifact = artifactsSchema.parse(await artifactsResponse.json()).artifacts.find((a) => a.name === ARTIFACT && !a.expired);
    if (!artifact) return fail('no-artifact', `The latest run has no ${ARTIFACT} artifact`);
    const zipResponse = await fetchImpl(`${api}/actions/artifacts/${artifact.id}/zip`, { headers, redirect: 'follow' });
    if (!zipResponse.ok) return fail('ci-failed', `GitHub answered ${zipResponse.status}`);
    const entry = readZip(Buffer.from(await zipResponse.arrayBuffer())).find((e) => e.path.endsWith('bdd.json'));
    if (!entry) return fail('no-artifact', `The ${ARTIFACT} artifact has no bdd.json`);
    return ok({
      run: run.id, url: run.html_url, commit: run.head_sha, date: run.created_at,
      requirements: resultsByRequirement(JSON.parse(new TextDecoder().decode(entry.data))),
    });
  } catch (error) {
    return fail('ci-failed', `Could not read CI results: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}`);
  }
}
