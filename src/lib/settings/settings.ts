// Provider connections and model per task, stored in keel.db (REQ-009).
import { z } from 'zod';
import { DEFAULT_ANTHROPIC_MODEL } from '../providers/anthropic';
import { MODEL_TASKS, PROVIDER_IDS, type ModelChoice, type ModelTask, type ProviderConfig, type RealProviderId } from '../providers/types';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { decryptSecret, encryptSecret, workspaceKey } from './secrets';

const storedConfig = z.strictObject({
  apiKey: z.string().optional(),        // encrypted
  baseUrl: z.string().optional(),
  endpoint: z.string().optional(),
  deployment: z.string().optional(),
  apiVersion: z.string().optional(),
});

export const modelChoiceSchema = z.strictObject({
  provider: z.enum(PROVIDER_IDS),
  model: z.string().trim().min(1).max(200),
});

/** What Settings may show: connection details, and whether a key is stored, never the key. */
export type ProviderView = Omit<ProviderConfig, 'apiKey'> & { hasKey: boolean };

export const DEFAULT_CHOICE: ModelChoice = { provider: 'anthropic', model: DEFAULT_ANTHROPIC_MODEL };

function readJson<T>(store: Store, key: string, schema: z.ZodType<T>): T | undefined {
  const raw = store.index.getSetting(key);
  if (raw === undefined) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** A provider's stored settings, with the key still encrypted. */
function storedProvider(store: Store, id: RealProviderId): z.infer<typeof storedConfig> {
  return readJson(store, `provider.${id}`, storedConfig) ?? {};
}

/** A provider's connection settings without the key. */
export function providerView(store: Store, id: RealProviderId): ProviderView {
  const { apiKey, ...rest } = storedProvider(store, id);
  return { ...rest, hasKey: Boolean(apiKey) };
}

export interface ProviderUpdate extends Omit<ProviderConfig, 'apiKey'> {
  apiKey?: string;       // new key; empty or absent keeps the stored one
  clearKey?: boolean;
}

/** Saves a provider's connection settings, encrypting any new key. */
export function saveProvider(store: Store, id: RealProviderId, update: ProviderUpdate): void {
  const current = storedProvider(store, id);
  const { apiKey, clearKey, ...details } = update;
  const sealed = clearKey ? undefined : apiKey ? encryptSecret(workspaceKey(store.home), apiKey) : current.apiKey;
  const clean = Object.fromEntries(Object.entries(details).filter(([, v]) => v));
  store.index.setSetting(`provider.${id}`, JSON.stringify({ ...clean, ...(sealed ? { apiKey: sealed } : {}) }));
}

/** A provider's connection settings with the key decrypted, for building the adapter. */
export function providerConfig(store: Store, id: RealProviderId): Result<ProviderConfig, 'cannot-decrypt'> {
  const { apiKey, ...rest } = storedProvider(store, id);
  if (!apiKey) return ok(rest);
  const key = decryptSecret(workspaceKey(store.home), apiKey);
  return key.ok ? ok({ ...rest, apiKey: key.value }) : key;
}

export function modelChoice(store: Store, task: ModelTask): ModelChoice {
  return readJson(store, `model.${task}`, modelChoiceSchema) ?? DEFAULT_CHOICE;
}

export function saveModelChoice(store: Store, task: ModelTask, choice: ModelChoice): Result<ModelChoice, 'invalid-choice'> {
  const parsed = modelChoiceSchema.safeParse(choice);
  if (!parsed.success || !MODEL_TASKS.some((t) => t.task === task)) return fail('invalid-choice', 'Choose a provider and a model');
  store.index.setSetting(`model.${task}`, JSON.stringify(parsed.data));
  return ok(parsed.data);
}
