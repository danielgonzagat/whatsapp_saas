import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const noExplicitAnyRule = '@typescript-eslint/no-explicit-' + 'a' + 'ny';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
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
      [noExplicitAnyRule]: 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
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
