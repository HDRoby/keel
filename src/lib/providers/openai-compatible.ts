// OpenAI-compatible endpoints such as Ollama (REQ-009).
import OpenAI from 'openai';
import { chatCompletionsProvider } from './openai';
import type { ChatProvider, ProviderConfig } from './types';

export const DEFAULT_COMPATIBLE_BASE_URL = 'http://localhost:11434/v1';

/** Local servers usually need no key; the SDK still requires a value. */
export function createOpenAICompatibleProvider(config: ProviderConfig): ChatProvider {
  return chatCompletionsProvider('openai-compatible', new OpenAI({
    apiKey: config.apiKey || 'not-needed',
    baseURL: config.baseUrl || DEFAULT_COMPATIBLE_BASE_URL,
  }), false);
}
