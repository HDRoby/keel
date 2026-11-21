// Anthropic adapter (REQ-009). Uses the official SDK's streaming API.
import Anthropic from '@anthropic-ai/sdk';
import { ProviderError, type ChatMessage, type ChatOptions, type ChatProvider, type ProviderConfig } from './types';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

// Models that accept server-side refusal fallbacks.
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

/** Splits Keel's messages into Anthropic's top-level system prompt and user/assistant turns. */
export function toAnthropicMessages(messages: ChatMessage[]): { system?: string; messages: Anthropic.Beta.BetaMessageParam[] } {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = messages
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
  return { ...(system ? { system } : {}), messages: turns };
}

/** Without a stored key the SDK falls back to ANTHROPIC_API_KEY or an `ant auth login` profile. */
export function createAnthropicProvider(config: ProviderConfig, client = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {})): ChatProvider {
  return {
    id: 'anthropic',
    async *stream(messages: ChatMessage[], options: ChatOptions) {
      const fallbacks = FALLBACK_MODELS.has(options.model)
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {};
      const stream = client.beta.messages.stream(
        { model: options.model, max_tokens: options.maxTokens ?? 64000, ...toAnthropicMessages(messages), ...fallbacks },
        { signal: options.signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') throw new ProviderError('anthropic', 'refused', 'The model declined this request.');
    },
  };
}
