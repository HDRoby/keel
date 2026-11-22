// UI guard rails (CR-0008, task R13): colours come only from the tokens in globals.css, and pages have no inline
// styles (the ESLint rule in eslint.config.mjs enforces the second; this test checks it is configured).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const HEX = /#[0-9a-f]{3,8}\b/gi;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Hex colours in a file, ignoring HTML entities (&#123;) and URL fragments such as href="/spec#design". */
function hexColours(text: string): string[] {
  return [...text.matchAll(HEX)].filter((m) => {
    const before = text.slice(0, m.index).split('\n').at(-1) ?? '';
    return !before.endsWith('&') && !/(href=|\/[\w?=&-]*)\S*$/.test(before);
  }).map((m) => m[0]);
}

describe('UI guard rails', () => {
  it('uses hex colours only in src/app/globals.css', () => {
    const offenders = files(SRC)
      .filter((f) => /\.(css|tsx)$/.test(f) && relative(SRC, f) !== join('app', 'globals.css'))
      .flatMap((f) => hexColours(readFileSync(f, 'utf8')).map((hex) => `${relative(process.cwd(), f)}: ${hex}`));
    expect(offenders).toEqual([]);
  });

  it('finds a hex colour, and ignores anchors and numbers', () => {
    expect(hexColours('color: #3366ff; border: 1px solid #fff')).toEqual(['#3366ff', '#fff']);
    expect(hexColours('<a href="#design">')).toEqual([]);
    expect(hexColours('href={`/spec?tab=design#${id}`}')).toEqual([]);
    expect(hexColours('background: #000;')).toEqual(['#000']);
  });

  it('forbids inline styles in pages', async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText('export const A = () => <div style={{ color: "red" }} />;\n', { filePath: join(SRC, 'app', 'guard-check.tsx') });
    expect(result?.messages.map((m) => m.ruleId)).toContain('react/forbid-dom-props');
  }, 30_000);
});
