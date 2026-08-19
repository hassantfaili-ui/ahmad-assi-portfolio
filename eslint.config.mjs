import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * eslint-config-next 16 ships flat config directly, so it is spread rather than
 * bridged through FlatCompat.
 *
 * The bridge is not merely unnecessary, it was broken: loading this config
 * through @eslint/eslintrc under ESLint 9 threw "Converting circular structure
 * to JSON" from the compat layer's validator, on every file, before reading a
 * line of source. That made `npm run lint` a gate nothing could pass, which is
 * worse than no gate at all because it looks like one.
 */
const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      'node_modules/**',
      'src/generated/**',
      'src/content/**',
      'public/**',
    ],
  },
];

export default config;
