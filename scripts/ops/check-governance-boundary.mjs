#!/usr/bin/env node

import { collectChangedFiles } from './lib/changed-files.mjs';
import { readJsonFile } from './lib/scan-utils.mjs';

const manifest = readJsonFile('ops/protected-governance-files.json', null);

if (
  !manifest ||
  !Array.isArray(manifest.protectedExact) ||
  !Array.isArray(manifest.protectedPrefixes)
) {
  console.error(
    '[check-governance-boundary] ops/protected-governance-files.json invalido ou ausente.',
  );
  process.exit(1);
}

const protectedExact = new Set(manifest.protectedExact.map(String));
const protectedPrefixes = manifest.protectedPrefixes.map(String);
const changedFiles = collectChangedFiles();

const protectedChanges = changedFiles.filter((file) => isProtected(file));
const activeAirlock = hasActivePr276Airlock();
const violations = activeAirlock ? [] : protectedChanges;

if (violations.length > 0) {
  console.error(
    '[check-governance-boundary] Arquivos de governance foram alterados sem aprovacao humana explicita:',
  );
  for (const file of violations) {
    console.error(`- ${file}`);
  }
  console.error(
    'Mudancas futuras de governance precisam de PR dedicado com aprovacao humana explicita; arquivos de approvals nao sao aceitos.',
  );
  process.exit(1);
}

if (activeAirlock && protectedChanges.length > 0) {
  console.log(
    `[check-governance-boundary] OK — airlock PR #276 ativo para ${protectedChanges.length} arquivo(s) protegido(s).`,
  );
} else {
  console.log('[check-governance-boundary] OK');
}

function isProtected(file) {
  return (
    protectedExact.has(file) ||
    protectedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix))
  );
}

function hasActivePr276Airlock() {
  const airlock = manifest.airlock_pr;
  return airlock?.active === true && String(airlock.pr || '').trim() === '#276';
}
