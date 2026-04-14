// @ts-check
//
// Worker ESLint config (P6-9). Mirrors the backend's flat config but uses
// the untyped `recommended` rules instead of `recommendedTypeChecked` —
// the worker does not maintain a dedicated `tsconfig.eslint.json` and the
// fully-typed rule set would flag ~hundreds of pre-existing `any`/`unsafe-*`
// warnings that are out of scope for this PR.
//
// The goal of this initial config is parity with the backend gate: lint
// runs in CI, new code follows prettier, and obvious bugs (unused imports,
// missing return types where useful) surface automatically. Rule tuning
// can follow in subsequent cleanup PRs.

import eslint from '@eslint/js';
import seatbelt from 'eslint-seatbelt';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const strictLint = process.env.KLOEL_STRICT_LINT === 'true';

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      'node_modules/**',
      'prisma/**',
      'browser-runtime/**', // dead legacy code, not imported by any source
    ],
  },
  seatbelt.configs.enable,
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': strictLint ? 'error' : 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      'no-case-declarations': 'error',
      'no-empty': 'error',
      'no-useless-escape': 'error',
      'no-control-regex': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
