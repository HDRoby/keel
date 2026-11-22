// Package smoke test (CR-0014): install the packed keel-sdlc into an empty folder, then run it as a user would.
//   npm pack && npm run smoke [-- keel-sdlc-x.y.z.tgz]
// Checks `keel --version`, `keel --dry-run`, and that `keel --no-open` on a new folder answers its first page.
// Uses a temporary user folder, so it never reads or writes your own Keel settings.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const WINDOWS = process.platform === 'win32';
const root = join(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

function tarball() {
  const given = process.argv[2];
  if (given) return resolve(given);
  const packed = readdirSync(root).filter((f) => /^keel-sdlc-.*\.tgz$/.test(f)).map((f) => join(root, f));
  if (!packed.length) throw new Error('No keel-sdlc-*.tgz here: run npm pack first, or pass the file.');
  return packed.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

/** Runs a command in the install folder; on Windows npm and npx are .cmd files and need a shell. */
function run(command, args, cwd, env) {
  return execFileSync(command, args, { cwd, env, encoding: 'utf8', shell: WINDOWS, stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

async function firstPage(url, seconds) {
  for (let i = 0; i < seconds * 2; i += 1) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return response.status;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No answer from ${url} after ${seconds} s`);
}

function stop(child) {
  if (WINDOWS) {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // already gone
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');   // the whole group: npx, keel and the server
    } catch {
      // already gone
    }
  }
}

const work = mkdtempSync(join(tmpdir(), 'keel-smoke-'));
const install = join(work, 'install');
const env = { ...process.env, KEEL_USER_DIR: join(work, 'user'), npm_config_yes: 'true', npm_config_audit: 'false', npm_config_fund: 'false' };
let server;
try {
  const file = tarball();
  console.log(`smoke: installing ${file}`);
  mkdirSync(install);
  writeFileSync(join(install, 'package.json'), '{ "name": "keel-smoke", "private": true }\n');
  run('npm', ['install', '--no-save', file], install, env);

  const shown = run('npx', ['--no-install', 'keel', '--version'], install, env);
  if (shown !== version) throw new Error(`keel --version printed "${shown}", expected ${version}`);
  console.log(`smoke: keel --version ${shown}`);

  const folder = join(work, 'project');
  mkdirSync(folder);
  const dry = JSON.parse(run('npx', ['--no-install', 'keel', folder, '--dry-run'], install, env));
  if (dry.mode !== 'standalone') throw new Error(`keel --dry-run would start "${dry.mode}", expected the standalone server`);
  console.log(`smoke: keel --dry-run ${JSON.stringify(dry)}`);

  const port = await freePort();
  server = spawn('npx', ['--no-install', 'keel', folder, '--no-open', '--port', String(port)], { cwd: install, env, shell: WINDOWS, detached: !WINDOWS, stdio: ['ignore', 'inherit', 'inherit'] });
  const status = await firstPage(`http://127.0.0.1:${port}/`, 90);
  console.log(`smoke: first page answered ${status}`);
  if (existsSync(join(folder, '.keel'))) throw new Error('Opening a folder must not write to it before Initialise');
  console.log('smoke: passed');
} catch (error) {
  console.error(`smoke: failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server) stop(server);
  await new Promise((r) => setTimeout(r, 1000));
  rmSync(work, { recursive: true, force: true, maxRetries: 5 });
}
