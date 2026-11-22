// Settings › Test: one tiny call to a provider with its stored settings, to see at once whether they work.
import { fail, ok, type Result } from '../result';
import { modelChoice, providerConfig } from '../settings/settings';
import type { Store } from '../store/store';
import { DEFAULT_ANTHROPIC_MODEL } from './anthropic';
import { describeProviderError } from './errors';
import { createProvider } from './registry';
import { MODEL_TASKS, type RealProviderId } from './types';

/** The model to test with: the first task that uses this provider, or Anthropic's default. */
export function testModel(store: Store, provider: RealProviderId): string | undefined {
  const used = MODEL_TASKS.map((t) => modelChoice(store, t.task)).find((c) => c.provider === provider);
  return used?.model ?? (provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : undefined);
}

export async function testConnection(store: Store, provider: RealProviderId, env: Record<string, string | undefined> = process.env): Promise<Result<string, 'no-model' | 'failed'>> {
  const model = testModel(store, provider);
  if (!model) return fail('no-model', 'Choose this provider and a model under Model per task first, then test it.');
  const config = providerConfig(store, provider);
  if (!config.ok) return fail('failed', config.message);
  try {
    let text = '';
    for await (const chunk of createProvider(provider, config.value, env).stream([{ role: 'user', content: 'Reply with the word OK.' }], { model, maxTokens: 16 })) text += chunk;
    return ok(`Connected: ${model} answered${text.trim() ? ` "${text.trim().slice(0, 40)}"` : ''}.`);
  } catch (error) {
    return fail('failed', describeProviderError(provider, error));
  }
}
