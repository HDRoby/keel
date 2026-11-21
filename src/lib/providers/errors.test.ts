import { describe, expect, it } from 'vitest';
import { saveModelChoice, saveProvider } from '../settings/settings';
import { tempStore } from '../store/test-store';
import { checkApiKey, describeProviderError } from './errors';
import { testConnection, testModel } from './test-connection';
import { ProviderError } from './types';

describe('describeProviderError', () => {
  it('names the cause from the status, never from the provider message', () => {
    const withMessage = (status: number) => Object.assign(new Error('secret sk-ant-xyz in message'), { status });
    expect(describeProviderError('anthropic', withMessage(401))).toBe('Anthropic rejected the API key (401). Check the key in Settings.');
    expect(describeProviderError('openai', withMessage(404))).toBe('OpenAI does not know this model (404). Check the model name under Model per task.');
    expect(describeProviderError('anthropic', withMessage(429))).toContain('rate limiting');
    expect(describeProviderError('anthropic', withMessage(503))).toContain('server error (503)');
    expect(describeProviderError('openai-compatible', new TypeError('fetch failed'))).toContain('could not be reached');
    expect(describeProviderError('anthropic', new ProviderError('anthropic', 'refused', 'The model declined this request.'))).toBe('The model declined this request.');
    expect(describeProviderError('anthropic', withMessage(401))).not.toContain('sk-ant');
    const noCredit = Object.assign(new Error('400 {"error":{"message":"Your credit balance is too low to access the Anthropic API."}}'), { status: 400 });
    expect(describeProviderError('anthropic', noCredit)).toBe('Anthropic accepted the key, but the account has no credit left. Add credits under Plans & Billing at console.anthropic.com.');
    expect(describeProviderError('openai', Object.assign(new Error('insufficient_quota'), { status: 429 }))).toContain('no credit or quota');
  });
});

describe('checkApiKey', () => {
  it('refuses keys that are clearly for something else', () => {
    expect(checkApiKey('anthropic', 'apikey_0123456789abcdefghijklm')).toMatch(/start with "sk-ant-"/);
    expect(checkApiKey('anthropic', `sk-ant-api03-${'a'.repeat(40)}`)).toBeUndefined();
    expect(checkApiKey('openai', 'sk-ant- spaced key')).toMatch(/spaces/);
    expect(checkApiKey('openai', `sk-proj-${'b'.repeat(40)}`)).toBeUndefined();
    expect(checkApiKey('azure-openai', 'any-azure-key')).toBeUndefined();
    expect(checkApiKey('anthropic', '')).toBeUndefined();
  });
});

describe('testConnection', () => {
  it('tests with the model a task uses, and says when there is none', async () => {
    const store = tempStore();
    expect(testModel(store, 'anthropic')).toBe('claude-opus-5-5');
    expect(await testConnection(store, 'openai', { KEEL_PROVIDER: 'fake' })).toMatchObject({ error: 'no-model' });
    saveModelChoice(store, 'documents', { provider: 'openai', model: 'gpt-x' });
    saveProvider(store, 'openai', { apiKey: `sk-${'c'.repeat(30)}` });
    expect(await testConnection(store, 'openai', { KEEL_PROVIDER: 'fake' })).toMatchObject({ ok: true, value: expect.stringMatching(/^Connected: gpt-x answered "Reply from OpenAI/) });
  });
});
