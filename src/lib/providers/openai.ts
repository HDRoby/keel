// OpenAI adapter (REQ-009). The Azure and OpenAI-compatible adapters reuse streamChatCompletions.
import OpenAI from 'openai';
import type { ChatMessage, ChatOptions, ChatProvider, ProviderConfig, ProviderId } from './types';

/** Streams text from any client that speaks the Chat Completions API. */
export async function* streamChatCompletions(client: OpenAI, messages: ChatMessage[], options: ChatOptions): AsyncIterable<string> {
  const stream = await client.chat.completions.create(
    { model: options.model, messages, stream: true, ...(options.maxTokens ? { max_completion_tokens: options.maxTokens } : {}) },
    { signal: options.signal },
  );
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

export function chatCompletionsProvider(id: ProviderId, client: OpenAI): ChatProvider {
  return { id, stream: (messages, options) => streamChatCompletions(client, messages, options) };
}

/** Without a stored key the SDK falls back to OPENAI_API_KEY. */
export function createOpenAIProvider(config: ProviderConfig): ChatProvider {
  return chatCompletionsProvider('openai', new OpenAI(config.apiKey ? { apiKey: config.apiKey } : {}));
}
