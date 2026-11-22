import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileHistory } from '../store/git';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { existsSync } from 'node:fs';
import { attachMock, linkMock, listMocks, MAX_MOCK_BYTES, mockFileName, mockImage, mocksIndex, nextMockNumber, removeMock, replaceMock, sniffFile } from './references';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const text = (s: string) => new TextEncoder().encode(s);

async function withProject() {
  const store = tempStore();
  await initialiseProject(store, { title: 'P', author: 'Ada' });
  return store;
}

describe('files', () => {
  it('recognises PNG, JPG, PDF and HTML by content, not by name', () => {
    expect(sniffFile(PNG)).toEqual({ kind: 'image', extension: 'png' });
    expect(sniffFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ kind: 'image', extension: 'jpg' });
    expect(sniffFile(text('%PDF-1.7'))).toEqual({ kind: 'pdf', extension: 'pdf' });
    expect(sniffFile(text('﻿  <!DOCTYPE html><p>x'))).toEqual({ kind: 'html', extension: 'html' });
    expect(sniffFile(text('MZ\u0000executable'))).toBeUndefined();
    expect(sniffFile(text('<html>\u0000'))).toBeUndefined();
  });

  it('makes a safe file name', () => {
    expect(mockFileName('MOCK-002', '../../Stage Bär!.PNG', 'png')).toBe('mock-002-stage-ba-r.png');
    expect(mockFileName('MOCK-003', '.png', 'png')).toBe('mock-003.png');
  });
});

describe('attachMock and linkMock', () => {
  it('attaches a link, links it to requirements, and keeps the list in .keel/mocks/references.md', async () => {
    const store = await withProject();
    const attached = await attachMock(store, { document: 'intent', title: 'Mockup', url: 'https://example.com/mock' });
    expect(attached).toMatchObject({ ok: true, value: { id: 'MOCK-001', kind: 'link', source: 'https://example.com/mock', requirements: [] } });
    expect(await linkMock(store, 'MOCK-001', ['REQ-002', 'REQ-001'], ['REQ-001', 'REQ-002'])).toMatchObject({ ok: true, value: { requirements: ['REQ-001', 'REQ-002'] } });
    expect(await linkMock(store, 'MOCK-001', ['REQ-404'], ['REQ-001'])).toMatchObject({ error: 'unknown-requirement' });
    expect(await linkMock(store, 'MOCK-009', [], [])).toMatchObject({ error: 'not-found' });
    const dir = store.root;
    expect(listMocks(dir)).toHaveLength(1);
    expect(readFileSync(join(dir, '.keel/mocks/references.md'), 'utf8')).toContain('| MOCK-001 | [Mockup](https://example.com/mock) | Link | Intent | REQ-001, REQ-002 |');
    expect((await fileHistory(dir, '.keel/mocks/references.md')).map((c) => c.message)).toEqual(['MOCK-001: attach link to the intent', 'MOCK-001: shows REQ-001, REQ-002']);
  });

  it('saves files under .keel/mocks/ and refuses unsafe links, unknown files and large files', async () => {
    const store = await withProject();
    const file = await attachMock(store, { document: 'spec', title: '', file: { name: 'Screen.png', bytes: PNG } });
    expect(file).toMatchObject({ ok: true, value: { id: 'MOCK-001', kind: 'image', source: 'mock-001-screen.png', title: 'Screen.png', document: 'spec' } });
    expect(readdirSync(join(store.root, '.keel/mocks')).sort()).toEqual(['mock-001-screen.png', 'references.md']);
    expect(await attachMock(store, { document: 'intent', title: '', url: 'javascript:alert(1)' })).toMatchObject({ error: 'invalid-input' });
    expect(await attachMock(store, { document: 'intent', title: '', url: 'not a url' })).toMatchObject({ error: 'invalid-input' });
    expect(await attachMock(store, { document: 'intent', title: '', file: { name: 'x.png', bytes: text('MZ') } })).toMatchObject({ error: 'unsupported-file' });
    expect(await attachMock(store, { document: 'intent', title: '', file: { name: 'x.png', bytes: new Uint8Array(MAX_MOCK_BYTES + 1) } })).toMatchObject({ error: 'too-large' });
    expect(await attachMock(tempStore(), { document: 'intent', title: '', url: 'https://x.y' })).toMatchObject({ error: 'not-found' });
  });

  it('writes an index that reads back', () => {
    const ref = { id: 'MOCK-001', title: 'A [b]', kind: 'pdf' as const, source: 'mock-001-a.pdf', document: 'spec' as const, requirements: [], added: '2026-11-20' };
    expect(mocksIndex('PRJ-0001', [ref])).toContain('| MOCK-001 | [A b](mock-001-a.pdf) | PDF | Spec | — |');
  });
});

describe('replaceMock, removeMock and mockImage', () => {
  it('replaces a file with a link, keeping the ID and requirements and removing the old file', async () => {
    const store = await withProject();
    await attachMock(store, { document: 'intent', title: 'Screen', file: { name: 'screen.png', bytes: PNG } });
    await linkMock(store, 'MOCK-001', ['REQ-001'], ['REQ-001']);
    const dir = store.root;
    expect(mockImage(dir, 'MOCK-001')).toMatchObject({ ok: true, value: { type: 'image/png' } });
    const replaced = await replaceMock(store, 'MOCK-001', { title: '', url: 'https://example.com/v2' });
    expect(replaced).toMatchObject({ ok: true, value: { id: 'MOCK-001', kind: 'link', title: 'Screen', requirements: ['REQ-001'], document: 'intent' } });
    expect(existsSync(join(dir, '.keel/mocks/mock-001-screen.png'))).toBe(false);
    expect(mockImage(dir, 'MOCK-001')).toMatchObject({ error: 'not-found' });
    expect((await fileHistory(dir, '.keel/mocks/mock-001-screen.png')).at(-1)?.message).toBe('MOCK-001: replace with link');
    expect(await replaceMock(store, 'MOCK-001', { title: '', url: 'ftp://x' })).toMatchObject({ error: 'invalid-input' });
    expect(await replaceMock(store, 'MOCK-009', { title: '', url: 'https://x.y' })).toMatchObject({ error: 'not-found' });
  });

  it('removes a reference and its file, and never serves a changed or non-image file', async () => {
    const store = await withProject();
    await attachMock(store, { document: 'spec', title: 'Doc', file: { name: 'doc.pdf', bytes: text('%PDF-1.7 x') } });
    await attachMock(store, { document: 'spec', title: 'Img', file: { name: 'img.png', bytes: PNG } });
    const dir = store.root;
    expect(mockImage(dir, 'MOCK-001')).toMatchObject({ error: 'not-found' });
    writeFileSync(join(dir, '.keel/mocks/mock-002-img.png'), '<script>alert(1)</script>');
    expect(mockImage(dir, 'MOCK-002')).toMatchObject({ error: 'unsupported-file' });
    expect(await removeMock(store, 'MOCK-001')).toMatchObject({ ok: true, value: { id: 'MOCK-001' } });
    expect(existsSync(join(dir, '.keel/mocks/mock-001-doc.pdf'))).toBe(false);
    expect(listMocks(dir).map((r) => r.id)).toEqual(['MOCK-002']);
    expect(await removeMock(store, 'MOCK-001')).toMatchObject({ error: 'not-found' });
    await removeMock(store, 'MOCK-002');
    await attachMock(store, { document: 'spec', title: '', url: 'https://a.b' });
    await removeMock(store, 'MOCK-003');
    await linkMock(store, 'MOCK-001', [], []).catch(() => undefined);
    expect(nextMockNumber(dir)).toBe(4);
    const next = await attachMock(store, { document: 'spec', title: '', url: 'https://x.y' });
    expect(next.ok && next.value.id).toBe('MOCK-004');
  });
});
