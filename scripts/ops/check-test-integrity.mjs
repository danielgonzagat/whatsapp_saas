#!/usr/bin/env node

import { collectNameStatus } from './lib/changed-files.mjs';
import {
  listFiles,
  loadApprovalEntries,
  matchesApproval,
  readJsonFile,
  readRepoFile,
} from './lib/scan-utils.mjs';

const TEST_FILE_RE = /\.(?:spec|test)\.[cm]?[jt]sx?$/i;
const SKIPPED_TEST_RE =
  /\b(?:it|test)\.skip\s*\(|\bxit\s*\(|\bxdescribe\s*\(|\b(?:it|test)\.todo\s*\(/g;
const EXPECT_RE = /\bexpect\s*\(/g;
const IMPORT_LOCAL_RE = /from\s+['"](?:\.\.?\/)|require\(\s*['"](?:\.\.?\/)/;
const TEST_DEFINITION_RE = /\b(?:it|test)\s*(?:\.only|\.skip)?\s*\(/;

const deletionApprovals = loadApprovalEntries(
  'ops/test-deletion-approvals.json',
  'ops/test-deletion-approvals.json',
);
const skippedApprovals = loadApprovalEntries(
  'ops/skipped-tests-approvals.json',
  'ops/skipped-tests-approvals.json',
);
const baseline = readJsonFile('ops/ratchet-baseline.json', null);

if (
  !baseline ||
  typeof baseline.testFileCount !== 'number' ||
  typeof baseline.expectCount !== 'number'
) {
  console.error(
    '[check-test-integrity] ops/ratchet-baseline.json precisa conter testFileCount e expectCount.',
  );
  process.exit(1);
}

const deletions = [];
for (const entry of collectNameStatus()) {
  const status = entry.status || '';

  if (status.startsWith('D')) {
    const deletedPath = entry.paths[0] || '';
    if (
      TEST_FILE_RE.test(deletedPath) &&
      !matchesApproval(deletionApprovals, deletedPath, 'testDeletion')
    ) {
      deletions.push(`deleted: ${deletedPath}`);
    }
    continue;
  }

  if (status.startsWith('R')) {
    const oldPath = entry.paths[0] || '';
    const newPath = entry.paths[1] || '';
    if (
      TEST_FILE_RE.test(oldPath) &&
      !TEST_FILE_RE.test(newPath) &&
      !matchesApproval(deletionApprovals, oldPath, 'testDeletion')
    ) {
      deletions.push(`renamed away from test surface: ${oldPath} -> ${newPath}`);
    }
  }
}

if (deletions.length > 0) {
  console.error('[check-test-integrity] Delecao de testes detectada sem aprovacao:');
  for (const deletion of deletions) {
    console.error(`- ${deletion}`);
  }
  process.exit(1);
}

const allTestFiles = listFiles(['backend', 'frontend', 'worker', 'e2e'], {
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  includeTests: true,
  predicate: (file) => TEST_FILE_RE.test(file),
});
const changedTestFiles = listFiles(['backend', 'frontend', 'worker', 'e2e'], {
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  includeTests: true,
  changedOnly: true,
  predicate: (file) => TEST_FILE_RE.test(file),
});

const failures = [];
const warnings = [];
let expectCount = 0;

for (const file of allTestFiles) {
  const content = readRepoFile(file);
  expectCount += (content.match(EXPECT_RE) || []).length;
}

for (const file of changedTestFiles) {
  const content = readRepoFile(file);

  const skippedMatches = content.match(SKIPPED_TEST_RE) || [];
  if (skippedMatches.length > 0 && !matchesApproval(skippedApprovals, file, 'skippedTest')) {
    failures.push(`${file} contem teste pulado (.skip/xit/xdescribe/todo)`);
  }

  if (TEST_DEFINITION_RE.test(content) && !content.includes('expect(')) {
    failures.push(`${file} define teste sem nenhum expect()`);
  }

  if (!IMPORT_LOCAL_RE.test(content)) {
    warnings.push(`${file} nao importa modulo local do codigo sob teste`);
  }
}

if (allTestFiles.length < baseline.testFileCount) {
  failures.push(
    `numero de arquivos de teste caiu de ${baseline.testFileCount} para ${allTestFiles.length}`,
  );
}

const minimumExpectCount = Math.ceil(baseline.expectCount * 0.95);
if (expectCount < minimumExpectCount) {
  failures.push(
    `numero de expect() caiu de ${baseline.expectCount} para ${expectCount} (minimo permitido ${minimumExpectCount})`,
  );
}

if (failures.length > 0) {
  console.error('[check-test-integrity] Violacoes detectadas:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  if (warnings.length > 0) {
    console.error('[check-test-integrity] Warnings adicionais:');
    for (const warning of warnings.slice(0, 20)) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('[check-test-integrity] Warnings:');
  for (const warning of warnings.slice(0, 20)) {
    console.warn(`- ${warning}`);
  }
}

console.log(
  `[check-test-integrity] OK — ${allTestFiles.length} arquivo(s) de teste, ${expectCount} expect().`,
);
