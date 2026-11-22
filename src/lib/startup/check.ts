// The startup check (REQ-009, REQ-012, REQ-005, CR-0012): before anything else, Keel checks your settings, that the
// model provider answers, that every task has a model that answers a short test message, and that the project's
// .keel/config.yml is valid. While a check fails Keel is in setup mode. The result is cached in the user folder for
// 10 minutes, keyed on the settings and the config, so pages and restarts stay fast; Check again and saving Settings
// run it afresh. Logs only check ids, states and durations, never keys or messages.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { readStyleFile } from '../brainstorm/styles';
import { configFormat } from '../config/migrate';
import { describeProviderError } from '../providers/errors';
import { effectiveChoice, localModels } from '../providers/local';
import { createProvider } from '../providers/registry';
import { MODEL_TASKS, PROVIDERS, type ModelChoice, type ProviderConfig, type RealProviderId } from '../providers/types';
import { providerConfig } from '../settings/settings';
import { SETTINGS_FILE } from '../settings/user-dir';
import { readStandard } from '../standards/library';
import type { Store } from '../store/store';
import { CONFIG_FILE, isInitialised, readConfig, readProject } from '../store/workspace';
import { parseTemplateRef, readTemplate } from '../templates/library';

export type CheckId = 'settings' | 'provider' | 'models' | 'project';
export type CheckState = 'ok' | 'bad' | 'waiting';

export interface CheckItem { id: CheckId; title: string; state: CheckState; message: string; fix?: string; line?: { number: number; text: string } }
export interface StartupResult { ok: boolean; firstRun: boolean; projectBad: boolean; checks: CheckItem[]; checkedAt: string; ms: number; summary: string }

export const HEALTH_FILE = 'health.json';
/** In the test message's system prompt: a health probe with no project content (the fake provider logs it apart). */
export const STARTUP_MARKER = 'Keel startup check: answer briefly.';
const TTL_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 20_000;
type Env = Record<string, string | undefined>;
type Where = Pick<Store, 'root' | 'user'>;

const TITLES: Record<CheckId, string> = { settings: 'Your settings', provider: 'Model provider', models: 'Models for each task', project: 'Project config' };
const label = (id: RealProviderId) => PROVIDERS.find((p) => p.id === id)?.label.replace(' (on this computer)', '') ?? id;
const taskLabel = (task: string) => MODEL_TASKS.find((t) => t.task === task)?.label ?? task;
const tilde = (path: string) => (process.env.HOME ? path.replace(process.env.HOME, '~') : path);

const settingsSchema = z.record(z.string(), z.unknown());

function read(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** The cache key: what the check depends on. */
function keyOf(where: Where, env: Env): string {
  return createHash('sha256').update([read(join(where.user, SETTINGS_FILE)) ?? '', env.KEEL_PROVIDER ?? ''].join('\0')).digest('hex');
}

/** The line of config.yml that names a value, for the message. */
function lineOf(root: string, needle: string): { number: number; text: string } | undefined {
  const lines = (read(join(root, CONFIG_FILE)) ?? '').split('\n');
  const index = lines.findIndex((l) => l.includes(needle));
  return index >= 0 ? { number: index + 1, text: (lines[index] ?? '').trim() } : undefined;
}

function checkSettings(where: Where): CheckItem {
  const file = join(where.user, SETTINGS_FILE);
  const text = read(file);
  if (text === undefined) {
    return { id: 'settings', title: TITLES.settings, state: 'bad', message: `No settings found in ${tilde(where.user)}. This looks like the first time Keel runs on this computer.`, fix: 'Fix: choose a model provider in Settings. Ollama is preselected.' };
  }
  try {
    if (!settingsSchema.safeParse(JSON.parse(text)).success) throw new Error('not an object');
  } catch {
    return { id: 'settings', title: TITLES.settings, state: 'bad', message: `${tilde(file)} is not valid JSON.`, fix: 'Fix: open Settings and save them again, or remove the file to start over.' };
  }
  for (const { id } of PROVIDERS) {
    const config = providerConfig(where as Store, id);
    if (!config.ok) return { id: 'settings', title: TITLES.settings, state: 'bad', message: `The stored key for ${label(id)} cannot be decrypted (the secret key on this computer changed).`, fix: `Fix: enter the ${label(id)} key again in Settings.` };
  }
  return { id: 'settings', title: TITLES.settings, state: 'ok', message: `${tilde(file)} is valid.` };
}

async function checkProviderAndModels(where: Where, env: Env): Promise<[CheckItem, CheckItem]> {
  const store = where as Store;
  const choices = await Promise.all(MODEL_TASKS.map(async ({ task }) => ({ task, choice: await effectiveChoice(store, task, env) })));
  const providers = [...new Set(choices.map((c) => c.choice.provider))];
  const local = providers.includes('ollama') ? await localModels(store, env) : undefined;
  const fake = env.KEEL_PROVIDER === 'fake';
  // The provider: Ollama must answer; a cloud provider needs its key (the test message below checks that it is accepted).
  for (const id of providers) {
    if (id === 'ollama' && local?.status === 'not-running') {
      return [{ id: 'provider', title: TITLES.provider, state: 'bad', message: `Keel could not reach Ollama at ${local.base} (connection refused).`, fix: 'Fix: start Ollama (open the app, or run ollama serve), then check again. Or choose another provider in Settings.' }, waiting('Checked once the provider answers.')];
    }
    if (id === 'ollama' && local?.status === 'no-models') {
      return [{ id: 'provider', title: TITLES.provider, state: 'bad', message: `Ollama is running at ${local.base} but has no models.`, fix: 'Fix: run ollama pull qwen3:14b (or another model), then check again.' }, waiting('Checked once a model is installed.')];
    }
    if (id !== 'ollama' && id !== 'openai-compatible' && !fake) {
      const config = providerConfig(store, id);
      const hasKey = config.ok && Boolean(config.value.apiKey) || (id === 'azure-openai' && config.ok && Boolean(config.value.endpoint));
      if (!hasKey) return [{ id: 'provider', title: TITLES.provider, state: 'bad', message: `${label(id)} is chosen for a task, but no API key is stored for it.`, fix: `Fix: enter the ${label(id)} key in Settings, or choose Ollama for that task.` }, waiting('Checked once the provider has a key.')];
    }
  }
  const providerLine = providers.map((id) => (id === 'ollama' ? `Ollama is running at ${local?.base} · ${local?.models.length ?? 0} model${local?.models.length === 1 ? '' : 's'} installed` : `${label(id)} is set up`)).join('; ');
  const provider: CheckItem = { id: 'provider', title: TITLES.provider, state: 'ok', message: `${providerLine}.` };

  // Every task has a model, Ollama's are installed, and each distinct model answers a short test message.
  for (const { task, choice } of choices) {
    if (!choice.model) return [provider, { id: 'models', title: TITLES.models, state: 'bad', message: `"${taskLabel(task)}" has no model.`, fix: `Fix: pick a model for "${taskLabel(task)}" in Settings.` }];
    if (choice.provider === 'ollama' && local && !local.models.some((m) => m.name === choice.model)) {
      return [provider, { id: 'models', title: TITLES.models, state: 'bad', message: `"${taskLabel(task)}" is set to ${choice.model}, which is not installed in Ollama.`, fix: `Fix: pick another model for "${taskLabel(task)}" in Settings, or run ollama pull ${choice.model}.` }];
    }
  }
  const distinct = [...new Map(choices.map((c) => [`${c.choice.provider}/${c.choice.model}`, c])).values()];
  for (const { task, choice } of distinct) {
    const failed = await testMessage(store, choice, env);
    if (failed) return [provider, { id: 'models', title: TITLES.models, state: 'bad', message: `A test message to ${choice.model} ("${taskLabel(task)}") got no answer: ${failed}`, fix: 'Fix: check the provider and model in Settings, then check again.' }];
  }
  return [provider, { id: 'models', title: TITLES.models, state: 'ok', message: 'Each task has a model, and a short test message got an answer.' }];
}

function waiting(message: string): CheckItem {
  return { id: 'models', title: TITLES.models, state: 'waiting', message };
}

/** Undefined when the model answered; otherwise the reason in plain words. */
async function testMessage(store: Store, choice: ModelChoice, env: Env): Promise<string | undefined> {
  const config = providerConfig(store, choice.provider);
  const settings: ProviderConfig = config.ok ? config.value : {};
  try {
    let text = '';
    const stream = createProvider(choice.provider, settings, env).stream([{ role: 'system', content: STARTUP_MARKER }, { role: 'user', content: 'Reply with the word OK.' }], { model: choice.model, maxTokens: 8, signal: AbortSignal.timeout(TEST_TIMEOUT_MS) });
    for await (const chunk of stream) text += chunk;
    return text.trim() ? undefined : 'the answer was empty';
  } catch (error) {
    return describeProviderError(choice.provider, error);
  }
}

function checkProject(root: string): CheckItem {
  const file = join(root, CONFIG_FILE);
  const project = readProject(root);
  if (!project.ok) {
    const first = project.message.split('\n').find((l) => l.trim()) ?? project.message;
    const path = /at\s+([\w.]+)/.exec(project.message)?.[1];
    const line = path ? lineOf(root, `${path.split('.').at(-1)}:`) : undefined;
    return { id: 'project', title: TITLES.project, state: 'bad', message: `${CONFIG_FILE}${line ? ` line ${line.number}` : ''}: ${first.replace(/^✖\s*/, '')}`, ...(line ? { line } : {}), fix: 'Fix: correct the file in Project setup, or restore it from git. Keel does not change the file on its own.' };
  }
  const problems: { key: string; ref: string; what: string }[] = [];
  for (const [kind, ref] of Object.entries(project.value.templates)) {
    const parsed = ref ? parseTemplateRef(ref) : undefined;
    if (ref && (!parsed || !readTemplate(root, parsed.id, parsed.version).ok)) problems.push({ key: `templates.${kind}`, ref, what: '.keel/templates' });
  }
  if (project.value.style && !readStyleFile(root, project.value.style).ok) problems.push({ key: 'style', ref: project.value.style, what: '.keel/styles' });
  for (const ref of project.value.standards) if (!readStandard(root, ref).ok) problems.push({ key: 'standards', ref, what: '.keel/standards' });
  const problem = problems[0];
  if (problem) {
    const line = lineOf(root, problem.ref);
    return {
      id: 'project', title: TITLES.project, state: 'bad',
      message: `${CONFIG_FILE}${line ? ` line ${line.number}` : ''}: "${problem.key}" names ${problem.ref}, which is not in ${problem.what}.`, ...(line ? { line } : {}),
      fix: 'Fix: choose an available one in Project setup, or restore the file from git. Keel does not change the file on its own.',
    };
  }
  return { id: 'project', title: TITLES.project, state: 'ok', message: `${tilde(file)} is valid (format ${configFormat(readConfig(root) ?? {})}).` };
}

/** The one terminal line when everything passes, or the failing check. */
export function startupLines(result: StartupResult): string[] {
  if (result.ok) return [`Startup check: ${result.summary}`];
  const bad = result.checks.find((c) => c.state === 'bad');
  return [`Startup check: ${bad ? `${bad.title}: ${bad.message}` : 'a check did not pass'}`, 'Keel opens in setup mode'];
}

/**
 * Runs the check. Settings, provider and models are cached for 10 minutes, keyed on settings.json, so pages and
 * restarts stay fast and the test message is not sent again; the project config is checked every time (it is cheap).
 */
export async function runStartupCheck(where: Where, options: { env?: Env; force?: boolean; now?: () => Date; quiet?: boolean } = {}): Promise<StartupResult> {
  const env = options.env ?? process.env;
  const key = keyOf(where, env);
  const cacheFile = join(where.user, HEALTH_FILE);
  const now = options.now?.() ?? new Date();
  const started = Date.now();
  let access: { checks: CheckItem[]; checkedAt: string } | undefined;
  if (!options.force) {
    try {
      const cached = JSON.parse(read(cacheFile) ?? '') as { key: string; checks: CheckItem[]; checkedAt: string };
      if (cached.key === key && now.getTime() - Date.parse(cached.checkedAt) < TTL_MS) access = cached;
    } catch {
      /* no usable cache */
    }
  }
  if (!access) {
    const settings = checkSettings(where);
    const [provider, models] = settings.state === 'ok'
      ? await checkProviderAndModels(where, env)
      : [{ id: 'provider' as const, title: TITLES.provider, state: 'waiting' as const, message: 'Checked once a provider is chosen.' }, { id: 'models' as const, title: TITLES.models, state: 'waiting' as const, message: 'Checked once a provider is chosen.' }];
    access = { checks: [settings, provider, models], checkedAt: now.toISOString() };
    if (existsSync(where.user) && settings.state !== 'bad') writeFileSync(cacheFile, `${JSON.stringify({ key, ...access })}\n`);
    if (!options.quiet) console.log(`startup check: ${access.checks.map((c) => `${c.id}=${c.state}`).join(' ')} in ${Date.now() - started} ms`);
  }
  const [settings, provider, models] = access.checks as [CheckItem, CheckItem, CheckItem];
  const project = isInitialised(where.root) ? checkProject(where.root) : { id: 'project' as const, title: TITLES.project, state: 'ok' as const, message: 'This folder has no .keel/ yet: Initialise follows.' };
  const checks = [settings, provider, models, project];
  const ok = checks.every((c) => c.state === 'ok');
  const result: StartupResult = {
    ok, firstRun: settings.state === 'bad' && !existsSync(join(where.user, SETTINGS_FILE)), projectBad: project.state === 'bad', checks,
    checkedAt: access.checkedAt, ms: Date.now() - started,
    summary: ok ? `settings OK · ${provider.message.replace(/\.$/, '').replace(/^Ollama is running at \S+ · (\d+) models? installed/, 'Ollama running, $1 models')} · test message answered` : '',
  };
  return result;
}

/** Forgets the cached result: the next check runs afresh (Check again, saving Settings). */
export function forgetStartupCheck(where: Pick<Store, 'user'>): void {
  rmSync(join(where.user, HEALTH_FILE), { force: true });
}
