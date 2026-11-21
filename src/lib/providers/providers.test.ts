import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { createAnthropicProvider, toAnthropicMessages } from './anthropic';
import { createAzureOpenAIProvider } from './azure-openai';
import { createFakeProvider, fakeReply } from './fake';
import { createOpenAICompatibleProvider } from './openai-compatible';
import { chatCompletionsProvider, createOpenAIProvider, streamChatCompletions } from './openai';
import { createProvider, providerForTask } from './registry';
import { MODEL_TASK_IDS, MODEL_TASKS, PROVIDER_IDS, PROVIDERS, ProviderError, type ChatMessage } from './types';
import { saveModelChoice } from '../settings/settings';
import { tempStore } from '../store/test-store';

const messages: ChatMessage[] = [
  { role: 'system', content: 'Be brief.' },
  { role: 'user', content: 'Hi' },
];

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}

describe('provider and task ids', () => {
  it('list the ids of PROVIDERS and MODEL_TASKS in order', () => {
    expect(PROVIDER_IDS).toEqual(PROVIDERS.map((p) => p.id));
    expect(MODEL_TASK_IDS).toEqual(['brainstorm', 'documents', 'feasibility']);
    expect(MODEL_TASK_IDS).toHaveLength(MODEL_TASKS.length);
  });
});

describe('fake provider', () => {
  it('names the provider it stands for and echoes the last user message', async () => {
    expect(fakeReply('openai', messages)).toBe('Reply from OpenAI: I read "Hi".');
    expect(await collect(createFakeProvider('anthropic').stream(messages, { model: 'x' }))).toBe('Reply from Anthropic: I read "Hi".');
  });
});

describe('anthropic adapter', () => {
  it('moves system messages to the system prompt', () => {
    expect(toAnthropicMessages(messages)).toEqual({ system: 'Be brief.', messages: [{ role: 'user', content: 'Hi' }] });
    expect(toAnthropicMessages([{ role: 'user', content: 'x' }])).toEqual({ messages: [{ role: 'user', content: 'x' }] });
  });

  function fakeClient(events: unknown[], stopReason: string, calls: unknown[]) {
    return {
      beta: { messages: { stream: (params: unknown) => {
        calls.push(params);
        return {
          async *[Symbol.asyncIterator]() { yield* events; },
          finalMessage: async () => ({ stop_reason: stopReason }),
        };
      } } },
    } as unknown as Anthropic;
  }

  it('streams text deltas and turns on refusal fallbacks for supported models', async () => {
    const calls: unknown[] = [];
    const events = [
      { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '...' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } },
    ];
    const provider = createAnthropicProvider({}, fakeClient(events, 'end_turn', calls));
    expect(await collect(provider.stream(messages, { model: 'claude-opus-5-5' }))).toBe('Hello');
    expect(calls[0]).toMatchObject({ model: 'claude-opus-5-5', system: 'Be brief.', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    await collect(provider.stream(messages, { model: 'claude-haiku-5-5' }));
    expect(calls[1]).not.toHaveProperty('fallbacks');
  });

  it('reports a refusal as a ProviderError', async () => {
    const provider = createAnthropicProvider({}, fakeClient([], 'refusal', []));
    await expect(collect(provider.stream(messages, { model: 'claude-opus-5-5' }))).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('chat completions adapters', () => {
  it('streams content deltas and skips empty chunks', async () => {
    const calls: unknown[] = [];
    const client = { chat: { completions: { create: async (params: unknown) => {
      calls.push(params);
      return (async function* () {
        yield { choices: [{ delta: { content: 'A' } }] };
        yield { choices: [{ delta: {} }] };
        yield { choices: [] };
        yield { choices: [{ delta: { content: 'B' } }] };
      })();
    } } } } as unknown as OpenAI;
    expect(await collect(streamChatCompletions(client, messages, { model: 'm', maxTokens: 10 }))).toBe('AB');
    expect(calls[0]).toMatchObject({ model: 'm', stream: true, max_completion_tokens: 10, messages });
    expect(chatCompletionsProvider('openai', client).id).toBe('openai');
  });

  it('builds each adapter with its own id', () => {
    expect(createOpenAIProvider({ apiKey: 'k' }).id).toBe('openai');
    expect(createAzureOpenAIProvider({ apiKey: 'k', endpoint: 'https://x.openai.azure.com', deployment: 'd' }).id).toBe('azure-openai');
    expect(createOpenAICompatibleProvider({}).id).toBe('openai-compatible');
  });
});

describe('registry', () => {
  it('uses the fake provider when KEEL_PROVIDER=fake', () => {
    expect(createProvider('openai', {}, { KEEL_PROVIDER: 'fake' }).id).toBe('fake');
    expect(createProvider('anthropic', { apiKey: 'k' }, {}).id).toBe('anthropic');
  });

  it('resolves the provider and model chosen for a task', async () => {
    const store = tempStore();
    saveModelChoice(store, 'brainstorm', { provider: 'openai', model: 'm1' });
    const resolved = providerForTask(store, 'brainstorm', { KEEL_PROVIDER: 'fake' });
    if (!resolved.ok) throw new Error(resolved.message);
    expect(resolved.value.choice).toEqual({ provider: 'openai', model: 'm1' });
    expect(await collect(resolved.value.provider.stream(messages, { model: 'm1' }))).toMatch(/^Reply from OpenAI/);
  });
});
