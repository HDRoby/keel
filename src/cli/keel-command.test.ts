// `npx keel [path]` (task R3), run as a command with --dry-run so no server starts.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BIN = join(process.cwd(), 'bin', 'keel.mjs');

function keel(...args: string[]) {
  const run = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', input: '' });
  let json: Record<string, unknown> | undefined;
  try {
    json = JSON.parse(run.stdout);
  } catch {
    json = undefined;
  }
  return { code: run.status, out: run.stdout, err: run.stderr, json };
}

describe('keel command', () => {
  it('opens the given folder on the first free port from 3000, with the title and description for Initialise', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-cli-'));
    const run = keel(root, '--title', 'Expense tracker', '--description', 'Track team expenses', '--dry-run');
    expect(run.code).toBe(0);
    expect(run.json).toMatchObject({ root, running: false });
    expect(Number(run.json?.port)).toBeGreaterThanOrEqual(3000);
    expect(run.json?.url).toBe(`http://127.0.0.1:${String(run.json?.port)}/?title=Expense+tracker&description=Track+team+expenses`);
  });

  it('refuses a missing folder without a terminal, and creates it with --create', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'keel-cli-')), 'demo');
    const refused = keel(root);
    expect(refused.code).toBe(1);
    expect(refused.err).toContain('does not exist. Run with --create to create it.');
    expect(existsSync(root)).toBe(false);
    expect(keel(root, '--create', '--dry-run').code).toBe(0);
    expect(existsSync(root)).toBe(true);
  });

  it('opens the running Keel again instead of starting a second one', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-cli-'));
    mkdirSync(join(root, '.keel', 'cache'), { recursive: true });
    writeFileSync(join(root, '.keel', 'cache', 'run.json'), JSON.stringify({ pid: process.pid, port: 3456 }));
    expect(keel(root, '--dry-run').json).toEqual({ root, running: true, url: 'http://127.0.0.1:3456/' });
    writeFileSync(join(root, '.keel', 'cache', 'run.json'), JSON.stringify({ pid: 999_999_999, port: 3456 }));
    expect(keel(root, '--dry-run').json).toMatchObject({ running: false });
  });

  it('rejects unknown options, a second folder and a bad port', () => {
    expect(keel('--nope').err).toContain('Unknown option --nope');
    expect(keel('a', 'b').err).toContain('Only one folder can be opened: b');
    expect(keel('--port', 'x').err).toContain('Not a port: x');
    expect(keel('--help').out).toContain('Usage: keel [path] [options]');
  });

  it('starts the pre-built standalone server when there is one, and next dev in a clone without a build (ADR-0016)', async () => {
    const { serverMode } = await import('../../bin/keel.mjs');
    const install = mkdtempSync(join(tmpdir(), 'keel-install-'));
    expect(serverMode(install)).toBe('dev');
    mkdirSync(join(install, '.next', 'standalone'), { recursive: true });
    writeFileSync(join(install, '.next', 'standalone', 'server.js'), '');
    expect(serverMode(install)).toBe('standalone');
  });

  it('prints its version, and tells the server where Keel is installed so the seed is found from any folder', async () => {
    const { installEnv, installFolder } = await import('../../bin/keel.mjs');
    const { seedDir } = await import('../lib/templates/library');
    expect(keel('--version').out.trim()).toBe(JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version);
    const env = installEnv('/opt/keel', {});
    expect(env).toEqual({ KEEL_HOME_DIR: '/opt/keel', KEEL_SEED: join('/opt/keel', 'seed') });
    expect(installEnv('/opt/keel', { KEEL_SEED: '/my/seed' }).KEEL_SEED).toBe('/my/seed');
    expect(seedDir({ KEEL_HOME_DIR: '/opt/keel' })).toBe(join('/opt/keel', 'seed'));
    expect(installFolder()).toBe(process.cwd());
  });
});
