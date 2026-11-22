// Provider connections and model per task, stored in the user config folder's settings.json (REQ-009, ADR-0011).
import { z } from 'zod';
import { DEFAULT_ANTHROPIC_MODEL } from '../providers/anthropic';
import { MODEL_TASKS, PROVIDER_IDS, type ModelChoice, type ModelTask, type ProviderConfig, type RealProviderId } from '../providers/types';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { decryptSecret, encryptSecret, workspaceKey } from './secrets';
import { setUserSetting, userSetting } from './user-dir';
import { gitUserName } from '../store/git';

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

// settings.json: { "provider.<id>": {...}, "model.<task>": {...}, ... }, keys encrypted.
function readJson<T>(store: Store, key: string, schema: z.ZodType<T>): T | undefined {
  const parsed = schema.safeParse(userSetting(store.user, key));
  return parsed.success ? parsed.data : undefined;
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
  const sealed = clearKey ? undefined : apiKey ? encryptSecret(workspaceKey(store.user), apiKey) : current.apiKey;
  const clean = Object.fromEntries(Object.entries(details).filter(([, v]) => v));
  setUserSetting(store.user, `provider.${id}`, { ...clean, ...(sealed ? { apiKey: sealed } : {}) });
}

/** A provider's connection settings with the key decrypted, for building the adapter. */
export function providerConfig(store: Store, id: RealProviderId): Result<ProviderConfig, 'cannot-decrypt'> {
  const { apiKey, ...rest } = storedProvider(store, id);
  if (!apiKey) return ok(rest);
  const key = decryptSecret(workspaceKey(store.user), apiKey);
  return key.ok ? ok({ ...rest, apiKey: key.value }) : key;
}

/** The name used in forms by default: git config user.name, else the name saved in Settings. */
export async function defaultAuthor(store: Pick<Store, 'root' | 'user'>): Promise<string> {
  const fromGit = await gitUserName(store.root);
  if (fromGit) return fromGit;
  const saved = userSetting(store.user, 'author');
  return typeof saved === 'string' ? saved : '';
}

/** Saves the default author name in the user config folder. Empty removes it. */
export function saveAuthor(store: Pick<Store, 'user'>, name: string): Result<string, 'invalid-name'> {
  const clean = name.trim();
  if (clean.length > 120) return fail('invalid-name', 'A name can be up to 120 characters');
  setUserSetting(store.user, 'author', clean || undefined);
  return ok(clean);
}

export function modelChoice(store: Store, task: ModelTask): ModelChoice {
  return readJson(store, `model.${task}`, modelChoiceSchema) ?? DEFAULT_CHOICE;
}

export function saveModelChoice(store: Store, task: ModelTask, choice: ModelChoice): Result<ModelChoice, 'invalid-choice'> {
  const parsed = modelChoiceSchema.safeParse(choice);
  if (!parsed.success || !MODEL_TASKS.some((t) => t.task === task)) return fail('invalid-choice', 'Choose a provider and a model');
  setUserSetting(store.user, `model.${task}`, parsed.data);
  return ok(parsed.data);
}

/** When Explore asks for a review (task R10): after this many seconds without typing, and at most this often. */
export interface ExploreTiming {
  pauseSeconds: number;
  intervalSeconds: number;
}

export const DEFAULT_EXPLORE_TIMING: ExploreTiming = { pauseSeconds: 5, intervalSeconds: 10 };

const timingSchema = z.strictObject({ pauseSeconds: z.number().min(0.5).max(60), intervalSeconds: z.number().min(0).max(300) });

export function exploreTiming(store: Pick<Store, 'user'>): ExploreTiming {
  const parsed = timingSchema.safeParse(userSetting(store.user, 'explore.timing'));
  return parsed.success ? parsed.data : DEFAULT_EXPLORE_TIMING;
}

export function saveExploreTiming(store: Pick<Store, 'user'>, timing: ExploreTiming): Result<ExploreTiming, 'invalid-timing'> {
  const parsed = timingSchema.safeParse(timing);
  if (!parsed.success) return fail('invalid-timing', 'The pause is 0.5 to 60 seconds and the interval 0 to 300 seconds');
  setUserSetting(store.user, 'explore.timing', parsed.data);
  return ok(parsed.data);
}
