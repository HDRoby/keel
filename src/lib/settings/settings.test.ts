import { describe, expect, it } from 'vitest';
import { tempStore } from '../store/test-store';
import { DEFAULT_CHOICE, modelChoice, providerConfig, providerView, saveModelChoice, saveProvider } from './settings';

describe('provider settings', () => {
  it('stores the key encrypted, shows only that one is set, and decrypts it for the adapter', () => {
    const store = tempStore();
    saveProvider(store, 'openai', { apiKey: 'sk-live-abc' });
    expect(store.index.getSetting('provider.openai')).not.toContain('sk-live-abc');
    expect(providerView(store, 'openai')).toEqual({ hasKey: true });
    expect(providerConfig(store, 'openai')).toEqual({ ok: true, value: { apiKey: 'sk-live-abc' } });
  });

  it('keeps the stored key when the field is left empty, and removes it on request', () => {
    const store = tempStore();
    saveProvider(store, 'azure-openai', { apiKey: 'k1', endpoint: 'https://x.openai.azure.com', deployment: 'd' });
    saveProvider(store, 'azure-openai', { apiKey: '', endpoint: 'https://y.openai.azure.com', deployment: 'd' });
    expect(providerConfig(store, 'azure-openai')).toMatchObject({ value: { apiKey: 'k1', endpoint: 'https://y.openai.azure.com' } });
    saveProvider(store, 'azure-openai', { clearKey: true, deployment: 'd' });
    expect(providerView(store, 'azure-openai')).toEqual({ deployment: 'd', hasKey: false });
  });

  it('ignores a corrupted setting', () => {
    const store = tempStore();
    store.index.setSetting('provider.anthropic', '{nope');
    expect(providerView(store, 'anthropic')).toEqual({ hasKey: false });
  });
});

describe('model per task', () => {
  it('defaults, saves per task and rejects bad choices', () => {
    const store = tempStore();
    expect(modelChoice(store, 'brainstorm')).toEqual(DEFAULT_CHOICE);
    expect(saveModelChoice(store, 'brainstorm', { provider: 'openai', model: ' m1 ' })).toEqual({ ok: true, value: { provider: 'openai', model: 'm1' } });
    expect(modelChoice(store, 'brainstorm')).toEqual({ provider: 'openai', model: 'm1' });
    expect(modelChoice(store, 'documents')).toEqual(DEFAULT_CHOICE);
    expect(saveModelChoice(store, 'brainstorm', { provider: 'openai', model: '' })).toMatchObject({ error: 'invalid-choice' });
    expect(saveModelChoice(store, 'brainstorm', { provider: 'nope' as 'openai', model: 'm' })).toMatchObject({ error: 'invalid-choice' });
  });
});
