import { describe, expect, it } from 'vitest';
import { createZip } from '../handoff/zip';
import { fetchCiResults, resultsByRequirement } from './ci';

const report = {
  suites: [{
    title: 'a', specs: [], suites: [
      { specs: [{ title: 'one', tags: ['REQ-001'], ok: true }, { title: 'two', tags: ['@REQ-001', 'smoke'], ok: false }] },
      { specs: [{ title: 'three', tags: ['REQ-002', 'REQ-002'], ok: true }] },
    ],
  }],
};

describe('resultsByRequirement', () => {
  it('counts passed and total scenarios per REQ tag', () => {
    expect(resultsByRequirement(report)).toEqual({ 'REQ-001': { passed: 1, total: 2 }, 'REQ-002': { passed: 1, total: 1 } });
    expect(resultsByRequirement(null)).toEqual({});
  });
});

describe('fetchCiResults', () => {
  const zip = createZip([{ path: 'bdd.json', data: new TextEncoder().encode(JSON.stringify(report)) }]);
  const seen: { url: string; auth?: string }[] = [];
  const fake = (answers: Record<string, unknown>) => async (url: string, init: { headers: Record<string, string> }) => {
    seen.push({ url, auth: init.headers.authorization });
    const key = Object.keys(answers).find((k) => url.includes(k));
    const body = key ? answers[key] : undefined;
    return { ok: body !== undefined && typeof body !== 'number', status: typeof body === 'number' ? body : body === undefined ? 404 : 200, json: async () => body, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer };
  };

  it('reads the bdd-results artifact of the latest finished run', async () => {
    const result = await fetchCiResults('my-org/app', 'main', 'github_pat_x', fake({
      '/actions/runs?': { workflow_runs: [{ id: 7, html_url: 'https://github.com/my-org/app/actions/runs/7', head_sha: 'abc', created_at: '2026-11-20T10:00:00Z', status: 'completed' }] },
      '/runs/7/artifacts': { artifacts: [{ id: 9, name: 'other', expired: false }, { id: 10, name: 'bdd-results', expired: false }] },
      '/artifacts/10/zip': 'zip',
    }));
    expect(result).toEqual({ ok: true, value: { run: 7, url: 'https://github.com/my-org/app/actions/runs/7', commit: 'abc', date: '2026-11-20T10:00:00Z', requirements: { 'REQ-001': { passed: 1, total: 2 }, 'REQ-002': { passed: 1, total: 1 } } } });
    expect(seen.every((s) => s.url.startsWith('https://api.github.com/repos/my-org/app/') && s.auth === 'Bearer github_pat_x')).toBe(true);
  });

  it('says why there are no results', async () => {
    expect(await fetchCiResults('my-org/app', 'main', 't', fake({ '/actions/runs?': 403 }))).toMatchObject({ error: 'not-allowed' });
    expect(await fetchCiResults('my-org/app', 'main', 't', fake({ '/actions/runs?': { workflow_runs: [] } }))).toMatchObject({ error: 'no-run' });
    expect(await fetchCiResults('my-org/app', 'main', 't', fake({
      '/actions/runs?': { workflow_runs: [{ id: 1, html_url: 'u', head_sha: 'a', created_at: 'd', status: 'completed' }] }, '/runs/1/artifacts': { artifacts: [] },
    }))).toMatchObject({ error: 'no-artifact' });
    expect(await fetchCiResults('../x', 'main', 't', fake({}))).toMatchObject({ error: 'ci-failed' });
  });
});
