#!/usr/bin/env node

import { collectChangedFiles } from './lib/changed-files.mjs';
import { loadApprovalEntries, matchesApproval, readJsonFile } from './lib/scan-utils.mjs';

const manifest = readJsonFile('ops/protected-governance-files.json', null);

if (
  !manifest ||
  !Array.isArray(manifest.protectedExact) ||
  !Array.isArray(manifest.protectedPrefixes) ||
  typeof manifest.approvalFile !== 'string'
) {
  console.error(
    '[check-governance-boundary] ops/protected-governance-files.json invalido ou ausente.',
  );
  process.exit(1);
}

const approvals = loadApprovalEntries(manifest.approvalFile, manifest.approvalFile);
const protectedExact = new Set(manifest.protectedExact.map(String));
const protectedPrefixes = manifest.protectedPrefixes.map(String);
const changedFiles = collectChangedFiles();

const violations = changedFiles.filter((file) => isProtected(file) && !isApproved(file));

if (violations.length > 0) {
  console.error(
    '[check-governance-boundary] Arquivos de governance foram alterados sem aprovacao humana explicita:',
  );
  for (const file of violations) {
    console.error(`- ${file}`);
  }
  console.error(
    `Use ${manifest.approvalFile} apenas quando houver aprovacao humana real. IA CLI nao pode editar esses arquivos por conta propria.`,
  );
  process.exit(1);
}

console.log('[check-governance-boundary] OK');

function isProtected(file) {
  return (
    protectedExact.has(file) ||
    protectedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix))
  );
}

function isApproved(file) {
  return matchesApproval(approvals, file, 'governanceChange');
}
