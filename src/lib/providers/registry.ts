// Picks the adapter for a task from Settings (REQ-009). KEEL_PROVIDER=fake swaps in scripted replies.
import { fail, ok, type Result } from '../result';
import { modelChoice, providerConfig } from '../settings/settings';
import type { Store } from '../store/db';
import { createAnthropicProvider } from './anthropic';
import { createAzureOpenAIProvider } from './azure-openai';
import { createFakeProvider } from './fake';
import { createOpenAICompatibleProvider } from './openai-compatible';
import { createOpenAIProvider } from './openai';
import type { ChatProvider, ModelChoice, ModelTask, ProviderConfig, RealProviderId } from './types';

const FACTORIES: Record<RealProviderId, (config: ProviderConfig) => ChatProvider> = {
  anthropic: createAnthropicProvider,
  openai: createOpenAIProvider,
  'azure-openai': createAzureOpenAIProvider,
  'openai-compatible': createOpenAICompatibleProvider,
};

export function createProvider(id: RealProviderId, config: ProviderConfig, env: Record<string, string | undefined> = process.env): ChatProvider {
  return env.KEEL_PROVIDER === 'fake' ? createFakeProvider(id) : FACTORIES[id](config);
}

/** The provider and model chosen for a task. */
export function providerForTask(
  store: Store,
  task: ModelTask,
  env: Record<string, string | undefined> = process.env,
): Result<{ provider: ChatProvider; choice: ModelChoice }, 'cannot-decrypt'> {
  const choice = modelChoice(store, task);
  const config = providerConfig(store, choice.provider);
  if (!config.ok) return fail(config.error, `${choice.provider}: ${config.message}`);
  return ok({ provider: createProvider(choice.provider, config.value, env), choice });
}
