// The models on this computer and whether a task can use a model now (REQ-009, REQ-005, CR-0011). With nothing
// saved, a task uses Ollama and the default local model for it. When Ollama is not running or has no models, the
// actions that need a model say why. KEEL_PROVIDER=fake (tests) reports a running Ollama with two models, unless a
// server address is saved, which the scenarios use to point Keel at a stub or at nothing.
import { providerView, savedModelChoice } from '../settings/settings';
import type { Store } from '../store/db';
import { defaultModels, ollamaBase, ollamaStatus, SUGGESTED_OLLAMA_MODEL, type LocalModel, type OllamaStatus } from './ollama';
import type { ModelChoice, ModelTask } from './types';

type Env = Record<string, string | undefined>;

const FAKE_MODELS: LocalModel[] = [
  { name: 'fake-large:32b', sizeBytes: 20_000_000_000, parameters: '32.8B', billions: 32.8, contextLength: 40960 },
  { name: 'fake-small:8b', sizeBytes: 5_000_000_000, parameters: '8.2B', billions: 8.2, contextLength: 40960 },
];

export async function localModels(store: Store, env: Env = process.env): Promise<{ status: OllamaStatus; models: LocalModel[]; base: string }> {
  const view = providerView(store, 'ollama');
  const base = ollamaBase(view);
  if (env.KEEL_PROVIDER === 'fake' && !view.baseUrl) return { status: 'running', models: FAKE_MODELS, base };
  return { ...(await ollamaStatus(base)), base };
}

/** The choice a task uses now: the saved one, or Ollama with the default local model. */
export async function effectiveChoice(store: Store, task: ModelTask, env: Env = process.env): Promise<ModelChoice> {
  const saved = savedModelChoice(store, task);
  if (saved) return saved;
  const local = await localModels(store, env);
  return { provider: 'ollama', model: defaultModels(local.models)[task] ?? '' };
}

/** Whether a task can call a model now, and why not. Only Ollama's own state is checked; other providers say so when called. */
export async function modelAvailability(store: Store, task: ModelTask, env: Env = process.env): Promise<{ ok: true } | { ok: false; reason: string }> {
  const choice = savedModelChoice(store, task) ?? { provider: 'ollama' as const, model: '' };
  if (choice.provider !== 'ollama') return { ok: true };
  const local = await localModels(store, env);
  if (local.status === 'not-running') return { ok: false, reason: `Ollama is not running at ${local.base}. Open the Ollama app or run \`ollama serve\`, or pick another provider in Settings.` };
  if (local.status === 'no-models') return { ok: false, reason: `Ollama has no models yet. Run \`ollama pull ${SUGGESTED_OLLAMA_MODEL}\`, then Check again in Settings.` };
  return { ok: true };
}
