// Facts about the code already in the project folder (REQ-013, task R12), so "Keep current" can be offered as a
// design option. Read from manifests only: nothing is sent anywhere and nothing is written.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RepoFacts {
  stack?: string;          // e.g. "Next.js with TypeScript"
  manifests: string[];     // e.g. ['package.json']
  dependencies: string[];  // the main ones, e.g. ['next', 'react', 'typescript']
}

const FRAMEWORKS: [string, string][] = [['next', 'Next.js'], ['@remix-run/react', 'Remix'], ['nuxt', 'Nuxt'], ['@angular/core', 'Angular'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['react', 'React'], ['express', 'Express'], ['fastify', 'Fastify']];

export function repoFacts(root: string): RepoFacts {
  const facts: RepoFacts = { manifests: [], dependencies: [] };
  const pkg = join(root, 'package.json');
  if (existsSync(pkg)) {
    facts.manifests.push('package.json');
    try {
      const data = JSON.parse(readFileSync(pkg, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = { ...data.dependencies, ...data.devDependencies };
      facts.dependencies = Object.keys(deps).sort();
      const framework = FRAMEWORKS.find(([name]) => name in deps)?.[1];
      const language = 'typescript' in deps || existsSync(join(root, 'tsconfig.json')) ? 'TypeScript' : 'JavaScript';
      facts.stack = framework ? `${framework} with ${language}` : `Node.js with ${language}`;
    } catch {
      facts.stack = 'Node.js';
    }
  }
  for (const [file, stack] of [['pyproject.toml', 'Python'], ['requirements.txt', 'Python'], ['go.mod', 'Go'], ['Cargo.toml', 'Rust'], ['pom.xml', 'Java'], ['build.gradle', 'Java or Kotlin']] as const) {
    if (existsSync(join(root, file))) {
      facts.manifests.push(file);
      facts.stack ??= stack;
    }
  }
  return facts;
}
