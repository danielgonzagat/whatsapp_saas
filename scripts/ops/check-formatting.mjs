#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
);

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
  '.github/workflows/nightly-ops-audit.yml',
  'docs/GITHUB_REPOSITORY_SETTINGS.md',
  'docs/STAGING_ENVIRONMENT.md',
  'docs/MONITORING_AND_ALERTING.md',
  'docs/LEGAL_AND_FINANCIAL_COMPLIANCE.md',
  'docs/PRODUCTION_READINESS.md',
  'CLAUDE.md',
  'package.json',
  'backend/package.json',
  'frontend/package.json',
  'worker/package.json',
  'backend/.prettierrc',
  'scripts/ops/guard-prisma-db-push.mjs',
  'scripts/ops/run-pulse-ci.mjs',
  'scripts/ops/validate-production-readiness.mjs',
  'scripts/ops/check-formatting.mjs',
];

const result = spawnSync(
  path.join(rootDir, 'node_modules', '.bin', 'prettier'),
  ['--check', ...targets],
  {
    cwd: rootDir,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
