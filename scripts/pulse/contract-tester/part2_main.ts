/**
 * Part 2: Main orchestrator exports.
 */

import * as fs from 'node:fs';
import * as path from 'path';
import type { Dirent } from 'fs';
import type {
  ContractStatus,
  ContractTestEvidence,
  ProviderContract,
} from '../../types.contract-tester';
import { ensureDir, pathExists, readDir, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import { walkFiles } from '../../parsers/utils';
import { deriveZeroValue } from '../../dynamic-reality-kernel/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/token-evidence';
import {
  CONTRACT_EVIDENCE_FILENAME,
  HTTP_METHOD_PATTERN,
  isAuthType,
  isContractStatus,
  isDiffSeverity,
  resolveAuthLabel,
  resolveStatusLabel,
} from './part0_constants';
import {
  collectUrlObservations,
  dedupeContracts,
  findBackendDir,
  findMigrationsDir,
  inferAuthTypeFromObservation,
  inferOpenApiAuthType,
  isOpenApiSpecFile,
  isPulseRuntimeArtifactFile,
  normalizeEndpoint,
  providerFromOpenApiSpec,
  providerFromUrl,
  uniqueStrings,
} from './part1_helpers';
import type { UrlObservation } from './part1_helpers';

// ── Private helpers for discovery ───────────────────────────────────────────

function extractOpenApiRequestSchema(operation: Record<string, unknown>): Record<string, unknown> {
  const requestBody = operation.requestBody;
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) return {};
  return { requestBody };
}

function extractOpenApiResponseSchema(operation: Record<string, unknown>): Record<string, unknown> {
  const responses = operation.responses;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return {};
  return { responses };
}

// ── Discovery functions ─────────────────────────────────────────────────────

export function discoverContractsFromOpenApi(rootDir: string): ProviderContract[] {
  const contracts: ProviderContract[] = [];
  const files = walkFiles(rootDir, ['.json']).filter((fp) => isOpenApiSpecFile(rootDir, fp));
  for (const filePath of files) {
    let spec: unknown;
    try {
      spec = JSON.parse(readTextFile(filePath, 'utf8'));
    } catch {
      continue;
    }
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue;
    const root = spec as Record<string, unknown>;
    const paths = root.paths;
    if (!paths || typeof paths !== 'object' || Array.isArray(paths)) continue;
    const provider = providerFromOpenApiSpec(root) ?? 'openapi_schema';
    for (const [endpoint, methods] of Object.entries(paths as Record<string, unknown>)) {
      if (!methods || typeof methods !== 'object' || Array.isArray(methods)) continue;
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        const normalizedMethod = method.toUpperCase();
        if (!HTTP_METHOD_PATTERN.test(normalizedMethod)) continue;
        const operationObject =
          operation && typeof operation === 'object' && !Array.isArray(operation)
            ? (operation as Record<string, unknown>)
            : {};
        contracts.push({
          provider,
          endpoint: normalizeEndpoint(endpoint, provider),
          method: normalizedMethod,
          expectedRequestSchema: extractOpenApiRequestSchema(operationObject),
          expectedResponseSchema: extractOpenApiResponseSchema(operationObject),
          expectedHeaders: [],
          authType: inferOpenApiAuthType(root, operationObject),
          status: resolveStatusLabel((l) => l === 'generated'),
          lastValidated: null,
          issues: [`Discovered from OpenAPI schema ${filePath.replace(rootDir + path.sep, '')}`],
        });
      }
    }
  }
  return contracts;
}

export function discoverContractsFromRuntimeArtifacts(rootDir: string): ProviderContract[] {
  const pulseDir = safeJoin(rootDir, '.pulse', 'current');
  if (!pathExists(pulseDir)) return [];
  let entries: (string | Dirent)[];
  try {
    entries = readDir(pulseDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const contracts: ProviderContract[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string' || !entry.isFile() || !isPulseRuntimeArtifactFile(entry.name))
      continue;
    const artifactPath = safeJoin(pulseDir, entry.name);
    let artifact: unknown;
    try {
      artifact = JSON.parse(readTextFile(artifactPath, 'utf8'));
    } catch {
      continue;
    }
    for (const observation of collectUrlObservations(artifact)) {
      const provider = providerFromUrl(observation.url);
      if (!provider) continue;
      contracts.push({
        provider,
        endpoint: normalizeEndpoint(observation.url, provider),
        method: observation.method ?? 'GET',
        expectedRequestSchema: observation.requestSchema ?? {},
        expectedResponseSchema: observation.responseSchema ?? {},
        expectedHeaders: observation.headers,
        authType: inferAuthTypeFromObservation(observation),
        status: 'generated',
        lastValidated: null,
        issues: [`Discovered from runtime artifact ${entry.name}`],
      });
    }
  }
  return dedupeContracts(contracts);
}

export function discoverContractsFromGraphArtifacts(rootDir: string): ProviderContract[] {
  const artifactNames = discoverAllObservedArtifactFilenames();
  const graphFiles = [artifactNames.structuralGraph, artifactNames.behaviorGraph].filter(
    Boolean,
  ) as string[];
  const contracts: ProviderContract[] = [];
  for (const fileName of graphFiles) {
    const filePath = safeJoin(rootDir, '.pulse', 'current', fileName);
    if (!pathExists(filePath)) continue;
    let graph: unknown;
    try {
      graph = JSON.parse(readTextFile(filePath, 'utf8'));
    } catch {
      continue;
    }
    for (const observation of collectUrlObservations(graph)) {
      const provider = providerFromUrl(observation.url);
      if (!provider) continue;
      contracts.push({
        provider,
        endpoint: normalizeEndpoint(observation.url, provider),
        method: observation.method ?? 'GET',
        expectedRequestSchema: observation.requestSchema ?? {},
        expectedResponseSchema: observation.responseSchema ?? {},
        expectedHeaders: observation.headers,
        authType: inferAuthTypeFromObservation(observation),
        status: 'generated',
        lastValidated: null,
        issues: [`Discovered from graph artifact ${fileName}`],
      });
    }
  }
  return dedupeContracts(contracts);
}

// ── Inline imports from sibling parts ───────────────────────────────────────
// These use top-level import dynamic workaround — see imports at bottom

import { defineProviderContracts } from './part5_contracts';
import { checkAPISchemaDiff } from './part6_diff';
import { checkMigrationSafety } from './part7_migrations';

// ── Public exports ──────────────────────────────────────────────────────────

export function buildContractTestEvidence(rootDir: string): ContractTestEvidence {
  const discoveredContracts = defineProviderContracts(rootDir);
  const baselineContracts = buildExpectedContracts(rootDir);
  const merged = mergeContracts(
    baselineContracts,
    discoveredContracts,
    scanProviderSdkUsage(rootDir),
  );
  const schemaDiffs = checkAPISchemaDiff(rootDir);
  const migrationChecks = checkMigrationSafety(rootDir);
  generateContractTestCases(merged);

  const totalContracts = merged.length;
  const validContracts = merged.filter((c) => isContractStatus(c.status, 'valid')).length;
  const brokenContracts = merged.filter((c) => isContractStatus(c.status, 'broken')).length;
  const untestedContracts = merged.filter(
    (c) => isContractStatus(c.status, 'untested') || isContractStatus(c.status, 'unknown'),
  ).length;
  const breakingChanges = schemaDiffs.filter((d) => isDiffSeverity(d.severity, 'breaking')).length;
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
  const artifactPath = safeJoin(evidenceDir, CONTRACT_EVIDENCE_FILENAME);
  ensureDir(evidenceDir, { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(evidence, null, 2));
  return evidence;
}

export function buildExpectedContracts(rootDir: string): ProviderContract[] {
  return dedupeContracts([
    ...discoverContractsFromOpenApi(rootDir),
    ...discoverContractsFromRuntimeArtifacts(rootDir),
    ...discoverContractsFromGraphArtifacts(rootDir),
  ]);
}

export function mergeContracts(
  baselines: ProviderContract[],
  discovered: ProviderContract[],
  sdkUsage: string[],
): ProviderContract[] {
  const result: ProviderContract[] = [];
  const seen = new Set<string>();
  const baselineByKey = new Map<string, ProviderContract>();
  const packages = new Set(sdkUsage);
  for (const c of baselines) baselineByKey.set(`${c.method} ${c.provider}${c.endpoint}`, c);

  for (const dc of discovered) {
    const key = `${dc.method} ${dc.provider}${dc.endpoint}`;
    seen.add(key);
    const baseline = baselineByKey.get(key);
    if (baseline) {
      result.push({
        ...baseline,
        expectedHeaders: uniqueStrings([...baseline.expectedHeaders, ...dc.expectedHeaders]),
        authType: isAuthType(
          baseline.authType,
          resolveAuthLabel((l) => l === 'none'),
        )
          ? dc.authType
          : baseline.authType,
        status: resolveStatusLabel((l) => l === 'untested'),
        lastValidated: null,
        issues: uniqueStrings([
          ...baseline.issues,
          ...dc.issues,
          'Discovered in codebase — pending live contract validation',
        ]),
      });
    } else {
      result.push(dc);
    }
  }

  for (const c of baselines) {
    const key = `${c.method} ${c.provider}${c.endpoint}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }

  if (packages.size > deriveZeroValue()) {
    for (const packageName of [...packages].sort()) {
      const key = `SDK ${packageName}/sdk-client`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          provider: packageName,
          endpoint: '/sdk-client',
          method: 'SDK',
          expectedRequestSchema: { source: 'observed_package_import', packageName },
          expectedResponseSchema: {},
          expectedHeaders: [],
          authType: resolveAuthLabel(() => true) as ProviderContract['authType'],
          status: resolveStatusLabel(() => true) as ContractStatus,
          lastValidated: null,
          issues: [`SDK import observed for ${packageName} — provider URL/schema not observed yet`],
        });
      }
    }
    for (const contract of result) {
      contract.issues = uniqueStrings([
        ...contract.issues,
        `SDK imports observed: ${[...packages].sort().join(', ')}`,
      ]);
    }
  }
  return result;
}

export function generateContractTestCases(contracts: ProviderContract[]): number {
  let count = deriveZeroValue();
  for (const contract of contracts) {
    if (
      isContractStatus(contract.status, 'generated') ||
      isContractStatus(contract.status, 'unknown')
    ) {
      contract.status = resolveStatusLabel((l) => l === 'generated');
      if (!contract.issues.includes('Contract test case generated — awaiting live execution')) {
        contract.issues.push('Contract test case generated — awaiting live execution');
      }
      count++;
    }
  }
  return count;
}

// NOTE: scanProviderSdkUsage is re-exported from part3_sdk; imported at top
import { scanProviderSdkUsage } from './part3_sdk';
