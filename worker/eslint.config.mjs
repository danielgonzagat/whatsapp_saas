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
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
      // Start lenient — the goal of the initial lint pass is a clean gate,
      // not a rewrite. Tighten these in follow-up cleanup PRs as the worker
      // codebase stabilises.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'no-case-declarations': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
