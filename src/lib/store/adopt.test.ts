import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContext } from '../brainstorm/session';
import { projectState } from '../gates/approvals';
import { stageGates } from '../gates/rules';
import { adoptProject, findKeelDocuments, importProject } from './adopt';
import { readDocument } from './documents';
import { tempStore } from './test-store';
import { readConfig, readProject, reserveRequirementIds } from './workspace';

const sh = (dir: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], { cwd: dir, encoding: 'utf8' }).trim();

const INTENT = `---
id: INT-0001
project: PRJ-0042
title: Expense tracker
author: Grace Hopper
created: 2026-10-01
updated: 2026-10-05
status: approved
version: 3
template: standard-intent@3
brainstorm_style: coach@1
---

# Intent: Expense tracker

## Problem

Teams lose receipts.

## Desired outcome

Every expense recorded within a day.

## Requirements

- REQ-001 Record an expense
- REQ-007 Export to CSV

## Affected users and systems

Team members and finance.
`;

function repoWithIntent() {
  const store = tempStore();
  sh(store.root, 'init', '-q', '--initial-branch=main');
  mkdirSync(join(store.root, 'docs'));
  writeFileSync(join(store.root, 'docs/intent.md'), INTENT);
  sh(store.root, 'add', '.');
  sh(store.root, 'commit', '-qm', 'Intent from the old tool');
  return store;
}

describe('adoptProject', () => {
  it('finds Keel documents, and adopts them without touching them', async () => {
    const store = repoWithIntent();
    expect(findKeelDocuments(tempStore().root)).toBeUndefined();
    expect(findKeelDocuments(store.root)).toMatchObject({ id: 'PRJ-0042', title: 'Expense tracker', author: 'Grace Hopper', style: 'coach@1', templates: { intent: 'standard-intent@3' }, maxReq: 7, documents: [{ path: 'docs/intent.md', id: 'INT-0001', version: 3, status: 'approved' }] });

    const adopted = await adoptProject(store);
    expect(adopted).toMatchObject({ ok: true, value: { id: 'PRJ-0042', title: 'Expense tracker', author: 'Grace Hopper', style: 'coach@1' } });
    expect(readFileSync(join(store.root, 'docs/intent.md'), 'utf8')).toBe(INTENT);
    expect(readConfig(store.root)).toMatchObject({ next_req: 8 });
    expect(sh(store.root, 'log', '-1', '--format=%an|%s')).toBe('Keel|Keel: Initialise project');
    expect(sh(store.root, 'show', '--name-only', '--format=', 'HEAD').split('\n').every((p) => p.startsWith('.keel/'))).toBe(true);
    expect(readDocument(store, 'docs/intent.md')).toMatchObject({ ok: true, value: { header: { version: 3, status: 'approved' } } });
    expect(store.index.documents().map((d) => d.path)).toEqual(['docs/intent.md']);
    // The brainstorm comes from the intent's sections, so the stages open as they should.
    const context = loadContext(store);
    expect(context.ok && Object.keys(context.value.session.answers)).toEqual(['Problem', 'Desired outcome', 'Requirements', 'Affected users and systems']);
    expect(stageGates(projectState(store)).filter((g) => g.available).map((g) => g.stage)).toEqual(['explore', 'intent', 'spec']);
    expect(await reserveRequirementIds(store, 1)).toEqual({ ok: true, value: ['REQ-008'] });
    expect(await adoptProject(store)).toMatchObject({ error: 'already-initialised' });
  });
});

describe('importProject', () => {
  function legacyWorkspace() {
    const home = mkdtempSync(join(tmpdir(), 'keel-legacy-'));
    const project = join(home, 'projects', 'expense-tracker');
    mkdirSync(join(project, 'docs', 'mocks'), { recursive: true });
    mkdirSync(join(project, 'tasks'));
    mkdirSync(join(project, 'features'));
    writeFileSync(join(project, 'project.md'), '---\nid: PRJ-0003\ntitle: Expense tracker\nauthor: Ada\ncreated: 2026-11-01\nstandards:\n  - security-baseline@2\nnext_req: 12\nhandoff:\n  install: make deps\n  run: make run\n  test: make test\n  scenarios: make bdd\n  verify: make check\n---\n\n# Expense tracker\n');
    writeFileSync(join(project, 'brainstorm.md'), '---\ntitle: Expense tracker\nidea: Track team expenses\ntemplate: standard-intent@3\nbrainstorm_style: market@1\nanswers: {}\ncurrent: null\ntranscript: []\n---\n');
    writeFileSync(join(project, 'docs', 'intent.md'), INTENT.replace('PRJ-0042', 'PRJ-0003'));
    writeFileSync(join(project, 'docs', 'mocks', 'README.md'), '---\nproject: PRJ-0003\nreferences: []\n---\n# Mock references\n');
    writeFileSync(join(project, 'docs', 'mocks', 'mock-001-screen.png'), 'png');
    writeFileSync(join(project, 'tasks', 'T1.md'), '---\nid: T1\n---\n# T1\n');
    writeFileSync(join(project, 'features', 'expense-tracker.feature'), 'Feature: X\n');
    execFileSync('git', ['init', '-q', project]);
    return { home, project };
  }

  it('copies a v0.1 project into a folder, writes config.yml from project.md, and commits it', async () => {
    const { home, project } = legacyWorkspace();
    const before = readdirSync(project).sort();
    const store = tempStore();
    const imported = await importProject(project, store, home);
    expect(imported).toMatchObject({ ok: true, value: { project: { id: 'PRJ-0003', title: 'Expense tracker', description: 'Track team expenses', style: 'market@1', standards: ['security-baseline@2'] } } });
    for (const path of ['docs/intent.md', 'tasks/T1.md', 'features/expense-tracker.feature', '.keel/brainstorm/explore.md', '.keel/mocks/references.md', '.keel/mocks/mock-001-screen.png', '.keel/templates/standard-intent@3.md', '.keel/styles/challenger@1.md']) {
      expect(existsSync(join(store.root, path)), path).toBe(true);
    }
    expect(existsSync(join(store.root, 'docs', 'mocks'))).toBe(false);
    expect(readConfig(store.root)).toMatchObject({ next_req: 12, commands: { verify: 'make check' } });
    expect(sh(store.root, 'log', '-1', '--format=%an|%s')).toBe('Keel|Keel: Import expense-tracker');
    expect(sh(store.root, 'status', '--porcelain')).toBe('');
    expect(readProject(store.root).ok).toBe(true);
    expect(readdirSync(project).sort()).toEqual(before);
    expect(await importProject(project, store, home)).toMatchObject({ error: 'already-initialised' });
    expect(await importProject(join(home, 'projects', 'missing'), tempStore())).toMatchObject({ error: 'not-found' });
  });
});
