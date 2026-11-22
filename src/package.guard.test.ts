// The published package is plain JavaScript (CR-0014, ADR-0016): nothing is compiled or downloaded per platform
// when someone runs npx keel-sdlc. This test fails if a dependency with native code is added.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; files: string[] };

/** Native code in a package folder: a node-gyp build file, a compiled .node file, or gypfile in package.json. */
function nativeFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === 'binding.gyp' || name.endsWith('.node')) found.push(path);
      else if (name === 'package.json' && (JSON.parse(readFileSync(path, 'utf8')) as { gypfile?: boolean }).gypfile) found.push(path);
    }
  };
  walk(dir);
  return found;
}

/** The folders of a package's production dependencies, followed through the tree. */
function productionTree(names: string[], from: string, seen = new Set<string>()): string[] {
  for (const name of names) {
    let folder = from;
    while (!existsSync(join(folder, 'node_modules', name, 'package.json')) && dirname(folder) !== folder) folder = dirname(folder);
    const dir = join(folder, 'node_modules', name);
    if (seen.has(dir) || !existsSync(dir)) continue;
    seen.add(dir);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    productionTree(Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }), dir, seen);
  }
  return [...seen];
}

describe('package without native code', () => {
  it('finds none in the production dependency tree', () => {
    const tree = productionTree(Object.keys({ ...PKG.dependencies, ...PKG.optionalDependencies }), ROOT);
    expect(tree.flatMap(nativeFiles)).toEqual([]);
  });

  it('finds none in the standalone server, when it is built', () => {
    const modules = join(ROOT, '.next', 'standalone', 'node_modules');
    if (!existsSync(modules)) return;
    expect(nativeFiles(modules)).toEqual([]);
  });

  it('would catch one: next itself, as a runtime dependency, brings sharp and the SWC binaries', () => {
    // This is why next and the other libraries are dev dependencies: the standalone build carries what the server needs.
    expect(productionTree(['next'], ROOT).flatMap(nativeFiles).length).toBeGreaterThan(0);
  });

  it('ships the built server, the compiled command and the seed', () => {
    expect(PKG.files).toEqual(expect.arrayContaining(['bin/', 'dist/', '.next/standalone/', 'seed/', 'LICENSE']));
  });
});
