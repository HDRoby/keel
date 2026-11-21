import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', '.features-gen/**', 'node_modules/**', 'test-results/**', 'next-env.d.ts'] },
  ...nextVitals,
  ...nextTs,
];

export default config;
