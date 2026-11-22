import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { saveExploreTiming, saveModelChoice, saveProvider } from '../settings/settings';
import { tempStore } from '../store/test-store';
import { initialiseProject, readConfig, writeConfig } from '../store/workspace';
import { forgetStartupCheck, HEALTH_FILE, runStartupCheck, startupLines } from './check';
import { allowedInSetup, setupRedirect } from './guard';

const fake = { KEEL_PROVIDER: 'fake' };
const states = (r: { checks: { id: string; state: string }[] }) => Object.fromEntries(r.checks.map((c) => [c.id, c.state]));

describe('runStartupCheck', () => {
  it('asks to set up Keel first when there are no settings, and waits with the model checks', async () => {
    const store = tempStore();
    rmSync(join(store.user, 'settings.json'), { force: true });
    const result = await runStartupCheck(store, { env: fake, quiet: true });
    expect(result).toMatchObject({ ok: false, firstRun: true });
    expect(states(result)).toEqual({ settings: 'bad', provider: 'waiting', models: 'waiting', project: 'ok' });
    expect(startupLines(result)).toEqual([expect.stringMatching(/^Startup check: Your settings: No settings found/), 'Keel opens in setup mode']);
    expect(setupRedirect(result, '/spec')).toBe('/check');
    expect(setupRedirect(result, '/settings')).toBeUndefined();
    expect(allowedInSetup(result)).toEqual(['/check', '/settings']);
  });

  it('passes with valid settings, a running provider and models that answer, and prints one line', async () => {
    const store = tempStore();
    saveExploreTiming(store, { pauseSeconds: 5, intervalSeconds: 10 });
    await initialiseProject(store, { title: 'Demo', author: 'Ada' });
    const result = await runStartupCheck(store, { env: fake, quiet: true });
    expect(states(result)).toEqual({ settings: 'ok', provider: 'ok', models: 'ok', project: 'ok' });
    expect(startupLines(result)).toEqual(['Startup check: settings OK · Ollama running, 2 models · test message answered']);
    expect(setupRedirect(result, '/spec')).toBeUndefined();
  });

  it('reports Ollama not running, a model that is not installed, and a missing cloud key', async () => {
    const store = tempStore();
    saveProvider(store, 'ollama', { baseUrl: 'http://127.0.0.1:9' });
    const down = await runStartupCheck(store, { env: fake, quiet: true });
    expect(down.checks.find((c) => c.id === 'provider')).toMatchObject({ state: 'bad', message: 'Keel could not reach Ollama at http://127.0.0.1:9 (connection refused).' });

    const other = tempStore();
    saveExploreTiming(other, { pauseSeconds: 5, intervalSeconds: 10 });
    saveModelChoice(other, 'documents', { provider: 'ollama', model: 'qwen3:32b' });
    const missing = await runStartupCheck(other, { env: fake, quiet: true });
    expect(missing.checks.find((c) => c.id === 'models')).toMatchObject({ state: 'bad', message: '"Spec and plan" is set to qwen3:32b, which is not installed in Ollama.' });

    saveModelChoice(other, 'documents', { provider: 'anthropic', model: 'claude-opus-5-5' });
    const noKey = await runStartupCheck(other, { env: {}, quiet: true, force: true });
    expect(noKey.checks.find((c) => c.id === 'provider')?.state).toBe('bad');
  });

  it('names the wrong line of an invalid project config, and never changes the file', async () => {
    const store = tempStore();
    saveExploreTiming(store, { pauseSeconds: 5, intervalSeconds: 10 });
    await initialiseProject(store, { title: 'Demo', author: 'Ada', standards: ['security-baseline@2'] });
    writeConfig(store.root, { ...readConfig(store.root), standards: ['security-baseline@7'] });
    const before = readFileSync(join(store.root, '.keel/config.yml'), 'utf8');
    const result = await runStartupCheck(store, { env: fake, quiet: true });
    const project = result.checks.find((c) => c.id === 'project');
    const line = before.split('\n').findIndex((l) => l.includes('security-baseline@7')) + 1;
    expect(project).toMatchObject({ state: 'bad', message: `.keel/config.yml line ${line}: "standards" names security-baseline@7, which is not in .keel/standards.`, line: { number: line, text: '- security-baseline@7' } });
    expect(result.projectBad).toBe(true);
    expect(allowedInSetup(result)).toEqual(['/check', '/settings', '/setup']);
    expect(readFileSync(join(store.root, '.keel/config.yml'), 'utf8')).toBe(before);
    writeFileSync(join(store.root, '.keel/config.yml'), 'id: nope\n');
    expect((await runStartupCheck(store, { env: fake, quiet: true })).checks.find((c) => c.id === 'project')?.state).toBe('bad');
  });

  it('keeps the model checks for 10 minutes unless the settings change or the check is forgotten', async () => {
    const store = tempStore();
    saveExploreTiming(store, { pauseSeconds: 5, intervalSeconds: 10 });
    const first = await runStartupCheck(store, { env: fake, quiet: true });
    const again = await runStartupCheck(store, { env: fake, quiet: true });
    expect(again.checkedAt).toBe(first.checkedAt);
    const later = await runStartupCheck(store, { env: fake, quiet: true, now: () => new Date(Date.parse(first.checkedAt) + 11 * 60_000) });
    expect(later.checkedAt).not.toBe(first.checkedAt);
    saveExploreTiming(store, { pauseSeconds: 6, intervalSeconds: 10 });
    expect(JSON.parse(readFileSync(join(store.user, HEALTH_FILE), 'utf8')).key).toBeDefined();
    forgetStartupCheck(store);
    expect(() => readFileSync(join(store.user, HEALTH_FILE))).toThrow();
  });
});
