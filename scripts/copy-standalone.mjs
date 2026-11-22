// After `next build`: completes .next/standalone so it runs on its own (ADR-0016).
// - The standalone server serves .next/static and public/ only when they sit next to it.
// - Keel reads files from folders it is given at run time, so the trace takes in the whole repository
//   (docs, changes, .git). Only the server, its dependencies and the seed library stay.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const KEEP = new Set(['server.js', 'package.json', '.next', 'node_modules', 'seed', 'public']);

const root = join(import.meta.dirname, '..');
const standalone = join(root, '.next', 'standalone');
if (!existsSync(join(standalone, 'server.js'))) {
  console.error('copy-standalone: .next/standalone/server.js is missing; run next build first.');
  process.exit(1);
}
const removed = readdirSync(standalone).filter((name) => !KEEP.has(name));
for (const name of removed) rmSync(join(standalone, name), { recursive: true, force: true });
cpSync(join(root, '.next', 'static'), join(standalone, '.next', 'static'), { recursive: true });
cpSync(join(root, 'seed'), join(standalone, 'seed'), { recursive: true });
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true });
console.log(`copy-standalone: kept ${[...KEEP].join(', ')}; removed ${removed.length} traced repository entries`);
