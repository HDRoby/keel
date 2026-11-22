import { describe, expect, it } from 'vitest';
import { saveModelChoice, saveProvider } from '../settings/settings';
import { tempStore } from '../store/test-store';
import { effectiveChoice, localModels, modelAvailability } from './local';
import { billionsOf, defaultModels, goodFor, listModels, ollamaBase, ollamaStatus, type LocalModel } from './ollama';
import { PROVIDERS } from './types';

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

/** A fetch that answers like Ollama with the given models. */
function fakeOllama(models: { name: string; size: number; parameters: string; context?: number }[]) {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.endsWith('/api/tags')) return json({ models: models.map((m) => ({ name: m.name, size: m.size, details: { parameter_size: m.parameters } })) });
    const asked = (JSON.parse(String(init?.body ?? '{}')) as { model: string }).model;
    const m = models.find((x) => x.name === asked);
    return json({ details: { parameter_size: m?.parameters }, model_info: m?.context ? { 'qwen3.context_length': m.context } : {} });
  };
  return { fetchImpl, calls };
}

const model = (name: string, billions: number): LocalModel => ({ name, sizeBytes: billions * 6e8, parameters: `${billions}B`, billions });

describe('Ollama', () => {
  it('is first in the provider list and needs no key', () => {
    expect(PROVIDERS[0]).toEqual({ id: 'ollama', label: 'Ollama (on this computer)' });
    expect(PROVIDERS.at(-1)?.label).toBe('Other OpenAI-compatible server');
    expect(ollamaBase({})).toBe('http://localhost:11434');
    expect(ollamaBase({ baseUrl: 'http://box:11434/v1/' })).toBe('http://box:11434');
  });

  it('lists the models with size, parameters and context length', async () => {
    const { fetchImpl, calls } = fakeOllama([{ name: 'qwen3:32b', size: 20e9, parameters: '32.8B', context: 40960 }, { name: 'gemma3:12b', size: 8e9, parameters: '12.2B' }]);
    expect(await listModels('http://x', fetchImpl)).toEqual([
      { name: 'qwen3:32b', sizeBytes: 20e9, parameters: '32.8B', billions: 32.8, contextLength: 40960 },
      { name: 'gemma3:12b', sizeBytes: 8e9, parameters: '12.2B', billions: 12.2 },
    ]);
    expect(calls).toEqual(['GET http://x/api/tags', 'POST http://x/api/show', 'POST http://x/api/show']);
    expect(await ollamaStatus('http://x', fakeOllama([]).fetchImpl)).toEqual({ status: 'no-models', models: [] });
    expect(await ollamaStatus('http://x', async () => { throw new Error('ECONNREFUSED'); })).toEqual({ status: 'not-running', models: [] });
  });

  it('picks the largest model for spec, plan and feasibility, and a mid-size one for section comments', () => {
    expect(defaultModels([model('a:70b', 70), model('b:8b', 8), model('c:1b', 1)])).toEqual({ documents: 'a:70b', feasibility: 'a:70b', brainstorm: 'b:8b' });
    expect(defaultModels([model('c:1b', 1), model('d:2b', 2)])).toEqual({ documents: 'd:2b', feasibility: 'd:2b', brainstorm: 'c:1b' });
    expect(defaultModels([])).toEqual({});
    expect(defaultModels([model('nomic-embed-text:latest', 40), model('b:8b', 8)])).toEqual({ documents: 'b:8b', feasibility: 'b:8b', brainstorm: 'b:8b' });
    expect(billionsOf(undefined, 'qwen3:32b')).toBe(32);
    expect(billionsOf('270M', 'x')).toBeCloseTo(0.27);
    expect([goodFor(model('a', 32)), goodFor(model('b', 12)), goodFor(model('c', 4)), goodFor(model('d', 1))]).toEqual([
      'Spec, plan and feasibility', 'Section comments; spec and plan with care', 'Section comments', 'Too small for Keel\'s documents',
    ]);
  });

  it('uses Ollama with the default local model when nothing is saved, and says why when no model is available', async () => {
    const store = tempStore();
    const fake = { KEEL_PROVIDER: 'fake' };
    expect((await localModels(store, fake)).status).toBe('running');
    expect(await effectiveChoice(store, 'documents', fake)).toEqual({ provider: 'ollama', model: 'fake-large:32b' });
    expect(await effectiveChoice(store, 'brainstorm', fake)).toEqual({ provider: 'ollama', model: 'fake-small:8b' });
    expect(await modelAvailability(store, 'documents', fake)).toEqual({ ok: true });
    saveProvider(store, 'ollama', { baseUrl: 'http://127.0.0.1:9' });
    expect(await modelAvailability(store, 'documents', fake)).toMatchObject({ ok: false, reason: expect.stringContaining('Ollama is not running at http://127.0.0.1:9') });
    saveModelChoice(store, 'documents', { provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(await modelAvailability(store, 'documents', fake)).toEqual({ ok: true });
    expect(await effectiveChoice(store, 'documents', fake)).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' });
  });
});
