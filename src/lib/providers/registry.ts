// Picks the adapter for a task from Settings (REQ-009). KEEL_PROVIDER=fake swaps in scripted replies.
import { fail, ok, type Result } from '../result';
import { providerConfig } from '../settings/settings';
import { effectiveChoice } from './local';
import type { Store } from '../store/store';
import { createAnthropicProvider } from './anthropic';
import { createAzureOpenAIProvider } from './azure-openai';
import { createFakeProvider } from './fake';
import { createOpenAICompatibleProvider } from './openai-compatible';
import { createOpenAIProvider } from './openai';
import { createOllamaProvider } from './ollama';
import type { ChatProvider, ModelChoice, ModelTask, ProviderConfig, RealProviderId } from './types';

const FACTORIES: Record<RealProviderId, (config: ProviderConfig) => ChatProvider> = {
  ollama: createOllamaProvider,
  anthropic: createAnthropicProvider,
  openai: createOpenAIProvider,
  'azure-openai': createAzureOpenAIProvider,
  'openai-compatible': createOpenAICompatibleProvider,
};

export function createProvider(id: RealProviderId, config: ProviderConfig, env: Record<string, string | undefined> = process.env): ChatProvider {
  return env.KEEL_PROVIDER === 'fake' ? createFakeProvider(id) : FACTORIES[id](config);
}

/** The provider and model chosen for a task: the saved choice, or Ollama with the default local model (CR-0011). */
export async function providerForTask(
  store: Store,
  task: ModelTask,
  env: Record<string, string | undefined> = process.env,
): Promise<Result<{ provider: ChatProvider; choice: ModelChoice }, 'cannot-decrypt'>> {
  const choice = await effectiveChoice(store, task, env);
  const config = providerConfig(store, choice.provider);
  if (!config.ok) return fail(config.error, `${choice.provider}: ${config.message}`);
  return ok({ provider: createProvider(choice.provider, config.value, env), choice });
}
