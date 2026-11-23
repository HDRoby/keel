// OpenAI adapter (REQ-009). The Azure and OpenAI-compatible adapters reuse streamChatCompletions.
import OpenAI from 'openai';
import type { ChatMessage, ChatOptions, ChatProvider, ProviderConfig, ProviderId } from './types';

/** Streams text from any client that speaks the Chat Completions API. */
export async function* streamChatCompletions(client: OpenAI, messages: ChatMessage[], options: ChatOptions, jsonMode = true): AsyncIterable<string> {
  const stream = await client.chat.completions.create(
    {
      model: options.model, messages, stream: true, ...(options.maxTokens ? { max_completion_tokens: options.maxTokens } : {}),
      // JSON mode: Ollama, OpenAI and Azure then return valid JSON (Ollama maps it to format: json).
      ...(options.json && jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    },
    { signal: options.signal },
  );
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

/** jsonMode false for servers that may not know response_format (generic OpenAI-compatible endpoints). */
export function chatCompletionsProvider(id: ProviderId, client: OpenAI, jsonMode = true): ChatProvider {
  return { id, stream: (messages, options) => streamChatCompletions(client, messages, options, jsonMode) };
}

/** Without a stored key the SDK falls back to OPENAI_API_KEY. */
export function createOpenAIProvider(config: ProviderConfig): ChatProvider {
  return chatCompletionsProvider('openai', new OpenAI(config.apiKey ? { apiKey: config.apiKey } : {}));
}
