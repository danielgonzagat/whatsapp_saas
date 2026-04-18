#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ZERO_SHA = /^0+$/;
const WHITESPACE_SPLIT_RE = /\s+/;

function exec(command, { capture = true } = {}) {
  if (capture) {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  execSync(command, {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  return '';
}

function safeExec(command) {
  try {
    return exec(command);
  } catch {
    return '';
  }
}

function collectPushRanges() {
  const stdin = readFileSync(0, 'utf8').trim();
  if (!stdin) return [];

  return stdin
    .split('\n')
    .map((line) => line.trim().split(WHITESPACE_SPLIT_RE))
    .filter((parts) => parts.length === 4)
    .map(([, localSha, , remoteSha]) => ({ localSha, remoteSha }))
    .filter(({ localSha }) => !ZERO_SHA.test(localSha));
}

function resolveBaseSha(localSha, remoteSha) {
  if (remoteSha && !ZERO_SHA.test(remoteSha)) return remoteSha;

  return (
    safeExec(`git merge-base ${localSha} origin/main`) ||
    safeExec(`git rev-parse ${localSha}^`) ||
    safeExec(`git rev-list --max-parents=0 ${localSha}`)
  );
}

function collectChangedFiles() {
  const ranges = collectPushRanges();
  const files = new Set();

  for (const { localSha, remoteSha } of ranges) {
    const baseSha = resolveBaseSha(localSha, remoteSha);
    if (!baseSha) continue;

    const diff = safeExec(`git diff --name-only ${baseSha} ${localSha}`);
    for (const file of diff
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)) {
      files.add(file);
    }
  }

  if (files.size > 0) {
    return [...files];
  }

  const fallback =
    safeExec('git diff --name-only @{upstream}...HEAD') ||
    safeExec('git diff --name-only HEAD~1...HEAD') ||
    safeExec('git diff --name-only --cached');

  return fallback
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasPrefix(files, prefixes) {
  return files.some((file) => prefixes.some((prefix) => file.startsWith(prefix)));
}

function hasExact(files, names) {
  return files.some((file) => names.includes(file));
}

function runStep(label, command) {
  console.log(`\n[pre-push] ${label}`);
  exec(command, { capture: false });
}

const CI_LIKE_ENV =
  'DATABASE_URL=postgresql://postgres:password@localhost:5432/whatsapp_saas_test ' +
  'JWT_SECRET=test_secret ' +
  'REDIS_URL=redis://localhost:6379 ' +
  'OPENAI_API_KEY=e2e-dummy-key ' +
  'METRICS_TOKEN=test-metrics-token ' +
  'DIAG_TOKEN=test-diag-token ' +
  'STRIPE_WEBHOOK_SECRET=whsec_test_scoped_prepush ' +
  'OPS_WEBHOOK_URL=https://example.com/ops-webhook ' +
  'DLQ_WEBHOOK_URL=https://example.com/dlq-webhook ';

// NEXT_PUBLIC_SENTRY_DSN is intentionally blanked here so next.config.ts
// does not throw the "Sentry source-map upload is not configured" guard
// when the pre-push hook runs `next build --webpack` on a developer box
// that has the DSN in frontend/.env.local but not the matching auth
// token / org / project. The guard is correct in production (those three
// must be present in Vercel before a real build); it is wrong during a
// pre-push validation that is not actually publishing source maps.
const FRONTEND_BUILD_ENV =
  `${CI_LIKE_ENV}` +
  'NEXT_PUBLIC_API_URL=http://localhost:3001 ' +
  'BACKEND_URL=http://localhost:3001 ' +
  'NEXTAUTH_URL=http://localhost:3000 ' +
  'NEXTAUTH_SECRET=test_secret ' +
  'NEXT_PUBLIC_SENTRY_DSN=';

const changedFiles = collectChangedFiles();

if (changedFiles.length === 0) {
  console.log('[pre-push] Nenhuma mudanca detectada para validar.');
  process.exit(0);
}

console.log('[pre-push] Arquivos detectados neste push:');
for (const file of changedFiles) {
  console.log(`  - ${file}`);
}

const repoInfraChanged =
  hasExact(changedFiles, [
    'package.json',
    'package-lock.json',
    '.husky/pre-commit',
    '.husky/pre-push',
    '.husky/commit-msg',
  ]) || hasPrefix(changedFiles, ['scripts/ops/']);

const frontendChanged =
  repoInfraChanged ||
  hasExact(changedFiles, ['frontend/package.json', 'frontend/package-lock.json']) ||
  hasPrefix(changedFiles, ['frontend/']);

const backendChanged =
  repoInfraChanged ||
  hasExact(changedFiles, ['backend/package.json', 'backend/package-lock.json']) ||
  hasPrefix(changedFiles, ['backend/']);

const workerChanged =
  repoInfraChanged ||
  hasExact(changedFiles, ['worker/package.json', 'worker/package-lock.json']) ||
  hasPrefix(changedFiles, ['worker/']);

runStep('Guard DB push', 'npm run guard:db-push');
runStep('Changed-code hard gates', 'npm run guard:new-code');

if (backendChanged) {
  runStep('Prisma validate', `${CI_LIKE_ENV} npm run prisma:validate`);
  runStep('Backend typecheck', 'npm run backend:typecheck');
  runStep('Backend build', `${CI_LIKE_ENV} npm --prefix backend run build`);
  runStep('Backend boot smoke', `${CI_LIKE_ENV} npm run backend:boot-smoke`);
}

if (frontendChanged) {
  runStep('Frontend typecheck', 'npm run frontend:typecheck');
  runStep('Frontend tests', 'npm --prefix frontend test');
  runStep('Frontend clean build', `${FRONTEND_BUILD_ENV} npm run frontend:build:clean`);
}

if (workerChanged) {
  runStep('Worker typecheck', 'npm run worker:typecheck');
  runStep('Worker tests', `${CI_LIKE_ENV} npm --prefix worker test`);
}

console.log('\n[pre-push] Validacao concluida com sucesso.');
