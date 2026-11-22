// Compiles src/cli.ts (`keel import`) to dist/cli.mjs, with its dependencies, so the package runs it without tsx.
import { build } from 'esbuild';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
await build({
  entryPoints: [join(root, 'src', 'cli.ts')],
  outfile: join(root, 'dist', 'cli.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'warning',
  // Some dependencies are CommonJS and call require().
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log('build-cli: wrote dist/cli.mjs');
