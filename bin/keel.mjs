#!/usr/bin/env node
// Starts Keel locally and opens the browser (ADR-0005).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const mode = existsSync(join(root, '.next', 'BUILD_ID')) ? 'start' : 'dev';
const url = 'http://localhost:3000';

const server = spawn(process.execPath, [next, mode, '--hostname', '127.0.0.1', '--port', '3000'], { cwd: root, stdio: 'inherit' });
server.on('exit', (code) => process.exit(code ?? 0));

const opener = { darwin: 'open', win32: 'explorer' }[process.platform] ?? 'xdg-open';
setTimeout(() => spawn(opener, [url], { stdio: 'ignore', detached: true }).on('error', () => console.log(`Open ${url}`)).unref(), 2000);
