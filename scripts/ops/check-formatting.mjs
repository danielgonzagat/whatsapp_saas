#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

const targets = [
  '.claude/settings.json',
  '.editorconfig',
  '.prettierrc.json',
  '.prettierignore',
  'commitlint.config.cjs',
  '.husky/pre-commit',
  '.husky/pre-push',
  '.husky/commit-msg',
  '.github/copilot-instructions.md',
  '.github/dependabot.yml',
  '.github/pull_request_template.md',
  '.github/workflows/ci-cd.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/deploy-production.yml',
  'docs/GITHUB_REPOSITORY_SETTINGS.md',
  'docs/STAGING_ENVIRONMENT.md',
  'docs/MONITORING_AND_ALERTING.md',
  'docs/LEGAL_AND_FINANCIAL_COMPLIANCE.md',
  'docs/PRODUCTION_READINESS.md',
  'package.json',
  'backend/package.json',
  'frontend/package.json',
  'worker/package.json',
  'backend/.prettierrc',
  'scripts/ops/guard-prisma-db-push.mjs',
  'scripts/ops/check-codacy-skip-tags.mjs',
  'scripts/ops/validate-production-readiness.mjs',
  'scripts/ops/check-formatting.mjs',
];

const existingTargets = targets.filter((target) => existsSync(path.join(rootDir, target)));

const result = spawnSync(
  path.join(rootDir, 'node_modules', '.bin', 'prettier'),
  ['--check', '--ignore-unknown', ...existingTargets],
  {
    cwd: rootDir,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
