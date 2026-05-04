import * as fs from 'node:fs';

import type { ContractTestEvidence } from '../../types.contract-tester';
import { ensureDir } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import { defineProviderContracts } from './provider-discovery';
import {
  buildExpectedContracts,
  mergeContracts,
  scanProviderSdkUsage,
  generateContractTestCases,
} from './contract-building';
import { checkAPISchemaDiff } from './schema-diff';
import { checkMigrationSafety } from './migration-safety';
import { CANONICAL_ARTIFACT_FILENAME } from './constants';

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function buildContractTestEvidence(rootDir: string): ContractTestEvidence {
  const discoveredContracts = defineProviderContracts(rootDir);
  const baselineContracts = buildExpectedContracts(rootDir);
  const sdkUsage = scanProviderSdkUsage(rootDir);

  const merged = mergeContracts(baselineContracts, discoveredContracts, sdkUsage);

  const schemaDiffs = checkAPISchemaDiff(rootDir);
  const migrationChecks = checkMigrationSafety(rootDir);

  generateContractTestCases(merged);

  const totalContracts = merged.length;
  const validContracts = merged.filter((c) => c.status === 'valid').length;
  const brokenContracts = merged.filter((c) => c.status === 'broken').length;
  const untestedContracts = merged.filter(
    (c) => c.status === 'untested' || c.status === 'unknown',
  ).length;
  const breakingChanges = schemaDiffs.filter((d) => d.severity === 'breaking').length;
  const destructiveMigrations = migrationChecks.filter((m) => m.destructive).length;

  const evidence: ContractTestEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalContracts,
      validContracts,
      brokenContracts,
      untestedContracts,
      breakingChanges,
      destructiveMigrations,
    } as ContractTestEvidence['summary'],
    contracts: merged,
    schemaDiffs,
    migrationChecks,
  };

  const evidenceDir = safeJoin(rootDir, '.pulse', 'current');
  const artifactPath = safeJoin(evidenceDir, CANONICAL_ARTIFACT_FILENAME);
  ensureDir(evidenceDir, { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(evidence, null, 2));

  return evidence;
}
