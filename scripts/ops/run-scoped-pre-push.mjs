#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ZERO_SHA = /^0+$/;

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
    .map((line) => line.trim().split(/\s+/))
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
    for (const file of diff.split('\n').map((value) => value.trim()).filter(Boolean)) {
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

  return fallback.split('\n').map((value) => value.trim()).filter(Boolean);
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

if (backendChanged) {
  runStep('Prisma validate', 'npm run prisma:validate');
  runStep('Backend typecheck', 'npm run backend:typecheck');
  runStep('Backend build', 'npm --prefix backend run build');
}

if (frontendChanged) {
  runStep('Frontend typecheck', 'npm run frontend:typecheck');
  runStep('Frontend tests', 'npm --prefix frontend test');
  runStep('Frontend clean build', 'npm run frontend:build:clean');
}

if (workerChanged) {
  runStep('Worker typecheck', 'npm run worker:typecheck');
  runStep('Worker tests', 'npm --prefix worker test');
}

console.log('\n[pre-push] Validacao concluida com sucesso.');
