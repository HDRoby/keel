// Failing step stubs for the acceptance scenarios in the handoff (REQ-006), for playwright-bdd in TypeScript.
// Every step gets a stub that throws "Not implemented", so every scenario fails until the agent builds it.

export interface FeatureFile {
  path: string;     // features/<name>.feature
  content: string;
}

type Keyword = 'Given' | 'When' | 'Then';

/** The steps of a feature file, with And/But resolved to the keyword before them. */
export function featureSteps(content: string): { keyword: Keyword; text: string }[] {
  const steps: { keyword: Keyword; text: string }[] = [];
  let last: Keyword = 'Given';
  for (const raw of content.split('\n')) {
    const match = /^\s*(Given|When|Then|And|But|\*)\s+(.+?)\s*$/.exec(raw);
    if (!match) continue;
    const word = match[1] as string;
    const keyword: Keyword = word === 'Given' || word === 'When' || word === 'Then' ? word : last;
    last = keyword;
    steps.push({ keyword, text: match[2] as string });
  }
  return steps;
}

/** Text inside a single-quoted TypeScript string. */
const quoted = (text: string) => text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** A step text as a Cucumber expression inside a single-quoted TypeScript string. */
export function stepExpression(text: string): string {
  return quoted(text.replace(/([\\(){}/])/g, '\\$1'));
}

/** One steps file per feature file. A step already defined for an earlier feature is not repeated. */
export function stepStubs(features: FeatureFile[]): { path: string; content: string }[] {
  const seen = new Set<string>();
  return features.map((feature) => {
    const stubs = featureSteps(feature.content).filter((s) => {
      const key = `${s.keyword} ${s.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const used = [...new Set(stubs.map((s) => s.keyword))].sort();
    const body = stubs.map((s) => `${s.keyword}('${stepExpression(s.text)}', async () => {\n  throw new Error('${quoted(`Not implemented: ${s.text}`)}');\n});`);
    const name = feature.path.replace(/^features\//, '').replace(/\.feature$/, '');
    return {
      path: `features/steps/${name}.steps.ts`,
      content: [
        "import { createBdd } from 'playwright-bdd';", '',
        `const { ${used.join(', ') || 'Given'} } = createBdd();`, '',
        ...(body.length ? [body.join('\n\n')] : ['// Every step of this feature is defined in another steps file.']), '',
      ].join('\n'),
    };
  });
}
