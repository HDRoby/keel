#!/usr/bin/env node
// `npx keel [path]`: starts Keel on one folder and opens the browser (ADR-0005, ADR-0009, task R3).
//   keel [path] [--title "..."] [--description "..."] [--port N] [--no-open] [--create] [--dry-run]
// The server binds to 127.0.0.1 only. A folder Keel already runs on is opened again, not started twice.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const HELP = `Usage: keel [path] [options]

Opens Keel on one folder (default: the current folder).

  --title "..."        prefill the title on the Initialise screen
  --description "..."  prefill the description on the Initialise screen
  --port N             port to use (default: the first free port from 3000)
  --no-open            do not open the browser
  --create             create the folder if it does not exist, without asking
  --dry-run            print what would run, as JSON, and exit
  --help               show this help`;

/** Parses the command line. Unknown options are an error. */
export function parseArgs(argv) {
  const options = { path: '.', open: true, create: false, dryRun: false, help: false };
  const values = { '--title': 'title', '--description': 'description', '--port': 'port' };
  const flags = { '--no-open': ['open', false], '--create': ['create', true], '--dry-run': ['dryRun', true], '--help': ['help', true], '-h': ['help', true] };
  let positional = 0;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg in values) {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      options[values[arg]] = value;
      i += 1;
    } else if (arg in flags) {
      const [key, value] = flags[arg];
      options[key] = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}`);
    } else if (positional === 0) {
      options.path = arg;
      positional += 1;
    } else {
      throw new Error(`Only one folder can be opened: ${arg}`);
    }
  }
  if (options.port !== undefined) {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Not a port: ${options.port}`);
    options.port = port;
  }
  return options;
}

/** True when nothing listens on the port at 127.0.0.1. */
export function portIsFree(port) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
  });
}

/** The first free port from `start`. */
export async function firstFreePort(start = 3000, tries = 100) {
  for (let port = start; port < start + tries; port += 1) if (await portIsFree(port)) return port;
  throw new Error(`No free port between ${start} and ${start + tries - 1}`);
}

const LOCK = join('.keel', 'cache', 'run.json');

/** The Keel run recorded for a folder, if its process is still alive. */
export function runningKeel(root) {
  const file = join(root, LOCK);
  if (!existsSync(file)) return undefined;
  try {
    const run = JSON.parse(readFileSync(file, 'utf8'));
    if (!Number.isInteger(run.pid) || !Number.isInteger(run.port)) return undefined;
    process.kill(run.pid, 0);
    return run;
  } catch {
    return undefined;   // unreadable, or the process is gone
  }
}

/** Records this run in .keel/cache/run.json, once the folder has .keel. */
export function writeRunLock(root, run) {
  if (!existsSync(join(root, '.keel'))) return false;
  mkdirSync(join(root, '.keel', 'cache'), { recursive: true });
  writeFileSync(join(root, LOCK), `${JSON.stringify(run)}\n`);
  return true;
}

/** Removes the lock if it is this run's. */
export function removeRunLock(root, pid) {
  const run = (() => {
    try {
      return JSON.parse(readFileSync(join(root, LOCK), 'utf8'));
    } catch {
      return undefined;
    }
  })();
  if (run?.pid === pid) rmSync(join(root, LOCK), { force: true });
}

/** The address to open: the Initialise screen takes the title and description as query parameters. */
export function startUrl(port, options) {
  const url = new URL(`http://127.0.0.1:${port}/`);
  if (options.title) url.searchParams.set('title', options.title);
  if (options.description) url.searchParams.set('description', options.description);
  return url.toString();
}

async function confirmCreate(root) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Create folder ${root}? (Y/n) `)).trim().toLowerCase();
  rl.close();
  return answer === '' || answer === 'y' || answer === 'yes';
}

function openBrowser(url) {
  const opener = { darwin: 'open', win32: 'explorer' }[process.platform] ?? 'xdg-open';
  spawn(opener, [url], { stdio: 'ignore', detached: true }).on('error', () => console.log(`Open ${url}`)).unref();
}

async function waitUntilUp(url, seconds = 120) {
  for (let i = 0; i < seconds * 2; i += 1) {
    try {
      await fetch(url, { redirect: 'manual' });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`keel: ${error.message}\n\n${HELP}`);
    return 1;
  }
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  const root = resolve(options.path);
  if (!existsSync(root)) {
    if (options.dryRun && !options.create) {
      console.log(JSON.stringify({ root, exists: false }));
      return 1;
    }
    const create = options.create || (await confirmCreate(root));
    if (!create) {
      console.error(process.stdin.isTTY ? 'keel: not created.' : `keel: ${root} does not exist. Run with --create to create it.`);
      return 1;
    }
    mkdirSync(root, { recursive: true });
  }
  if (!statSync(root).isDirectory()) {
    console.error(`keel: ${root} is not a folder`);
    return 1;
  }

  const running = runningKeel(root);
  if (running) {
    const url = startUrl(running.port, options);
    if (options.dryRun) console.log(JSON.stringify({ root, running: true, url }));
    else {
      console.log(`Keel already runs for ${root}: ${url}`);
      if (options.open) openBrowser(url);
    }
    return 0;
  }

  const install = join(dirname(fileURLToPath(import.meta.url)), '..');
  const mode = existsSync(join(install, '.next', 'BUILD_ID')) ? 'start' : 'dev';
  const port = options.port ?? (await firstFreePort(3000));
  if (options.port && !(await portIsFree(port))) {
    console.error(`keel: port ${port} is in use`);
    return 1;
  }
  const url = startUrl(port, options);
  if (options.dryRun) {
    console.log(JSON.stringify({ root, running: false, mode, port, url }));
    return 0;
  }

  const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
  const server = spawn(process.execPath, [next, mode, '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: install,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, KEEL_PROJECT_DIR: root },
  });
  console.log(`Keel for ${root}: http://127.0.0.1:${port}`);
  const run = { pid: process.pid, port, started: new Date().toISOString() };
  // The lock is written once .keel exists, which Initialise creates while Keel runs.
  const locker = setInterval(() => {
    if (writeRunLock(root, run)) clearInterval(locker);
  }, 2000);
  if (writeRunLock(root, run)) clearInterval(locker);
  const stop = () => {
    clearInterval(locker);
    removeRunLock(root, process.pid);
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
  server.on('exit', (code) => {
    stop();
    process.exit(code ?? 0);
  });
  if (await waitUntilUp(`http://127.0.0.1:${port}/api/startup`)) {
    // The startup check (CR-0012), printed before the browser opens; in setup mode the browser opens on it.
    const lines = await startupCheck(port);
    lines.forEach((line) => console.log(line));
    if (options.open) openBrowser(lines.includes('Keel opens in setup mode') ? `http://127.0.0.1:${port}/check` : url);
  }
  return undefined;
}

/** The startup check from the running server, as terminal lines. */
export async function startupCheck(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/startup`);
    const data = await response.json();
    return Array.isArray(data.lines) ? data.lines.map(String) : ['Startup check: no answer from Keel'];
  } catch {
    return ['Startup check: no answer from Keel'];
  }
}

// Run only when started as a command, so tests can import the helpers.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const code = await main(process.argv.slice(2));
  if (code !== undefined) process.exit(code);
}
