// Azure OpenAI adapter (REQ-009).
import { AzureOpenAI } from 'openai';
import { chatCompletionsProvider } from './openai';
import type { ChatProvider, ProviderConfig } from './types';

export const DEFAULT_AZURE_API_VERSION = '2024-10-21';

export function createAzureOpenAIProvider(config: ProviderConfig): ChatProvider {
  return chatCompletionsProvider('azure-openai', new AzureOpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    endpoint: config.endpoint,
    deployment: config.deployment,
    apiVersion: config.apiVersion || DEFAULT_AZURE_API_VERSION,
  }));
}
