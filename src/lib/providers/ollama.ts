// Ollama on this computer, the default provider (REQ-009, CR-0011). Chat goes through the OpenAI-compatible endpoint at
// <server>/v1; the models installed there come from /api/tags and /api/show. No key: nothing leaves this computer.
// Only the server calls Ollama, never the browser.
import OpenAI from 'openai';
import { chatCompletionsProvider } from './openai';
import type { ChatProvider, ModelTask, ProviderConfig } from './types';

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
/** A model that suits Keel, suggested when Ollama has none. */
export const SUGGESTED_OLLAMA_MODEL = 'qwen3:14b';
const TIMEOUT_MS = 2000;

export interface LocalModel {
  name: string;
  sizeBytes: number;
  parameters: string;        // as Ollama says it, e.g. "32.8B"
  billions: number;          // for sorting and the "Good for" hint
  contextLength?: number;
}

export type OllamaStatus = 'running' | 'not-running' | 'no-models';

export const ollamaBase = (config: ProviderConfig) => (config.baseUrl?.trim() || DEFAULT_OLLAMA_URL).replace(/\/+$/, '').replace(/\/v1$/, '');

export function createOllamaProvider(config: ProviderConfig): ChatProvider {
  return chatCompletionsProvider('ollama', new OpenAI({ apiKey: 'ollama', baseURL: `${ollamaBase(config)}/v1` }));
}

/** "32.8B" → 32.8, "270M" → 0.27; from the name ("qwen3:32b") when the details do not say. */
export function billionsOf(parameters: string | undefined, name: string): number {
  const m = /([\d.]+)\s*([BM])/i.exec(parameters ?? '') ?? /[:-]([\d.]+)([bm])\b/i.exec(name);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2]?.toUpperCase() === 'M' ? n / 1000 : n;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The models on the server, with size and parameters; throws when the server cannot be reached. */
export async function listModels(base: string, fetchImpl: FetchLike = fetch): Promise<LocalModel[]> {
  const call = async (path: string, init?: RequestInit) => {
    const response = await fetchImpl(`${base}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Ollama answered ${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  };
  const tags = await call('/api/tags');
  const models = Array.isArray(tags.models) ? (tags.models as { name?: string; model?: string; size?: number; details?: { parameter_size?: string } }[]) : [];
  return Promise.all(models.map(async (m) => {
    const name = m.name ?? m.model ?? '';
    let contextLength: number | undefined;
    let parameters = m.details?.parameter_size ?? '';
    try {
      const show = await call('/api/show', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: name }) });
      const info = (show.model_info ?? {}) as Record<string, unknown>;
      const key = Object.keys(info).find((k) => k.endsWith('.context_length'));
      if (key && typeof info[key] === 'number') contextLength = info[key] as number;
      const details = (show.details ?? {}) as { parameter_size?: string };
      parameters = details.parameter_size ?? parameters;
    } catch {
      /* the list is enough without the details */
    }
    return { name, sizeBytes: typeof m.size === 'number' ? m.size : 0, parameters, billions: billionsOf(parameters, name), ...(contextLength ? { contextLength } : {}) };
  }));
}

/** Running with models, running with none, or not reachable. */
export async function ollamaStatus(base: string, fetchImpl: FetchLike = fetch): Promise<{ status: OllamaStatus; models: LocalModel[] }> {
  try {
    const models = await listModels(base, fetchImpl);
    return { status: models.length ? 'running' : 'no-models', models };
  } catch {
    return { status: 'not-running', models: [] };
  }
}

/**
 * The default model per task from the local models: the largest for spec, plan and feasibility; for section comments
 * the largest from 3B to 14B, else the smallest.
 */
export function defaultModels(all: LocalModel[]): Partial<Record<ModelTask, string>> {
  // Embedding models cannot chat.
  const models = all.filter((m) => !/embed/i.test(m.name));
  if (models.length === 0) return {};
  const bySize = [...models].sort((a, b) => b.billions - a.billions || b.sizeBytes - a.sizeBytes);
  const largest = bySize[0]?.name ?? '';
  const mid = bySize.find((m) => m.billions >= 3 && m.billions <= 14) ?? bySize.at(-1);
  return { documents: largest, feasibility: largest, brainstorm: mid?.name ?? largest };
}

/** What a model is good for in Keel, from its size. */
export function goodFor(model: LocalModel): string {
  if (/embed/i.test(model.name)) return 'Embeddings only: not for chat';
  if (model.billions >= 25) return 'Spec, plan and feasibility';
  if (model.billions >= 7) return 'Section comments; spec and plan with care';
  if (model.billions >= 3) return 'Section comments';
  return 'Too small for Keel\'s documents';
}
