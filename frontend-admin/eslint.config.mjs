import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    'dist/**',
    'node_modules/**',
  ]),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react-hooks/purity': 'error',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@next/next/no-img-element': 'error',
      'jsx-a11y/alt-text': 'error',
      curly: ['error', 'all'],
    },
  },
]);

export default eslintConfig;
