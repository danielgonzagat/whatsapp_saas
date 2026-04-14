import { defineConfig, globalIgnores } from 'eslint/config';
import seatbelt from 'eslint-seatbelt';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const strictLint = process.env.KLOEL_STRICT_LINT === 'true';

const eslintConfig = defineConfig([
  seatbelt.configs.enable,
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'frontend/.next/**',
    'out/**',
    'frontend/out/**',
    'build/**',
    'frontend/build/**',
    'coverage/**',
    'next-env.d.ts',
    'frontend/coverage/**',
    'frontend/dist/**',
  ]),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': strictLint ? 'error' : 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off',
    },
  },
]);

export default eslintConfig;
