import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', '.features-gen/**', 'node_modules/**', 'test-results/**', 'next-env.d.ts', 'dist/**'] },
  ...nextVitals,
  ...nextTs,
  // UI guard rail (CR-0008, docs/ui-guide.md): pages use the components in src/components/ui, never inline styles.
  {
    files: ['src/app/**/*.tsx'],
    rules: {
      'react/forbid-dom-props': ['error', { forbid: [{ propName: 'style', message: 'Use a component from src/components/ui or a CSS module (docs/ui-guide.md).' }] }],
      'react/forbid-component-props': ['error', { forbid: [{ propName: 'style', message: 'Use a component from src/components/ui or a CSS module (docs/ui-guide.md).' }] }],
    },
  },
];

export default config;
