/**
 * PULSE Contract Testing & Schema Diff Engine
 *
 * Validates external provider API contracts against expected schemas, detects
 * breaking changes in the internal API surface by comparing against a previous
 * structural snapshot, and assesses Prisma migration safety for destructive
 * database operations.
 *
 * Artifact stored at: .pulse/current/PULSE_CONTRACT_EVIDENCE.json
 */

import * as path from 'path';
import * as fs from 'node:fs';
import type { Dirent } from 'fs';
import * as ts from 'typescript';
import type {
  ContractProvider,
  ContractStatus,
  ContractTestEvidence,
  MigrationSafetyCheck,
  ProviderContract,
  SchemaDiff,
  SchemaDiffSeverity,
} from './types.contract-tester';
import type { PulseStructuralGraph } from './types';
import { ensureDir, pathExists, readDir, readTextFile } from './safe-fs';
import { safeJoin } from './lib/safe-path';
import { walkFiles } from './parsers/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANONICAL_ARTIFACT_FILENAME = 'PULSE_CONTRACT_EVIDENCE.json';

const MIGRATIONS_DIRS = ['backend/prisma/migrations', 'prisma/migrations'];

const HTTP_METHOD_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  '.git',
  'coverage',
  '__tests__',
  '__mocks__',
  '.turbo',
  '.vercel',
]);

// ---------------------------------------------------------------------------
// SQL parsing matchers for destructive migration operations
// ---------------------------------------------------------------------------

const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi;
const DROP_COLUMN_RE = /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi;
const ALTER_COLUMN_TYPE_RE =
  /ALTER\s+COLUMN\s+[`"]?(\w+)[`"]?\s+(?:SET\s+DATA\s+)?TYPE\s+(\w+(?:\s*\(\s*\d+\s*(?:,\s*\d+\s*)?\))?)/gi;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Builds the complete contract testing evidence payload: identifies provider
 * contracts from codebase usage, enriches them with baseline schemas, diffs
 * the internal API surface against the last structural snapshot, and checks
 * all Prisma migrations for destructive operations.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        Structured contract testing evidence.
 */
export function buildContractTestEvidence(rootDir: string): ContractTestEvidence {
  const discoveredContracts = defineProviderContracts(rootDir);
  const baselineContracts = buildExpectedContracts(rootDir);
  const sdkUsage = scanProviderSdkUsage(rootDir);

  // Merge: baseline contracts take priority; discovered contracts fill gaps
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

// ---------------------------------------------------------------------------
// Dynamic provider contract builder
// ---------------------------------------------------------------------------

/**
 * Builds expected provider contracts from discovered evidence: OpenAPI/schema
 * files, runtime/replay artifacts, and structural/behavior graph metadata.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        List of baseline provider contracts.
 */
export function buildExpectedContracts(rootDir: string): ProviderContract[] {
  return dedupeContracts([
    ...discoverContractsFromOpenApi(rootDir),
    ...discoverContractsFromRuntimeArtifacts(rootDir),
    ...discoverContractsFromGraphArtifacts(rootDir),
  ]);
}

/**
 * Merges expected provider contracts with contracts discovered from live
 * codebase source scanning. A discovered contract with a matching endpoint
 * upgrades schema/artifact-derived evidence from "generated" to "untested".
 */
export function mergeContracts(
  baselines: ProviderContract[],
  discovered: ProviderContract[],
  sdkUsage: string[],
): ProviderContract[] {
  const result: ProviderContract[] = [];
  const seen = new Set<string>();
  const baselineByKey = new Map<string, ProviderContract>();
  const packages = new Set(sdkUsage);

  for (const c of baselines) {
    const key = `${c.method} ${c.provider}${c.endpoint}`;
    baselineByKey.set(key, c);
  }

  // First pass: add discovered contracts, upgrading matching baselines
  for (const dc of discovered) {
    const key = `${dc.method} ${dc.provider}${dc.endpoint}`;
    seen.add(key);

    const baseline = baselineByKey.get(key);
    if (baseline) {
      result.push({
        ...baseline,
        expectedHeaders: uniqueStrings([...baseline.expectedHeaders, ...dc.expectedHeaders]),
        authType: baseline.authType === 'none' ? dc.authType : baseline.authType,
        status: 'untested',
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

  // Second pass: add remaining baselines not yet discovered in code
  for (const c of baselines) {
    const key = `${c.method} ${c.provider}${c.endpoint}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }

  if (packages.size > 0) {
    for (const packageName of [...packages].sort()) {
      const key = `SDK ${packageName}/sdk-client`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(buildSdkImportContract(packageName));
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

function buildSdkImportContract(packageName: string): ProviderContract {
  return {
    provider: packageName,
    endpoint: '/sdk-client',
    method: 'SDK',
    expectedRequestSchema: { source: 'observed_package_import', packageName },
    expectedResponseSchema: {},
    expectedHeaders: [],
    authType: 'none',
    status: 'generated',
    lastValidated: null,
    issues: [`SDK import observed for ${packageName} — provider URL/schema not observed yet`],
  };
}

// ---------------------------------------------------------------------------
// SDK import detection
// ---------------------------------------------------------------------------

/**
 * Scans backend source files for package imports that look like external SDK
 * clients. The package names are evidence only; they are not mapped to provider
 * hosts unless the code or runtime artifacts expose an actual URL.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        List of provider hostnames with detected SDK imports.
 */
export function scanProviderSdkUsage(rootDir: string): string[] {
  const detected = new Set<string>();
  const backendDir = findBackendDir(rootDir);
  if (!backendDir) return [];

  const files = walkFiles(backendDir, ['.ts', '.tsx', '.js', '.jsx']);
  for (const filePath of files) {
    let content: string;
    try {
      content = readTextFile(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const rawImport of collectPackageImports(content, filePath)) {
      const packageName = normalizePackageName(rawImport);
      if (packageName && looksLikeExternalSdkImport(packageName)) {
        detected.add(packageName);
      }
    }
  }

  return [...detected];
}

function collectPackageImports(content: string, filePath: string): string[] {
  const source = parseSourceFile(filePath, content);
  const imports: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      const [specifier] = node.arguments;
      if (specifier && ts.isStringLiteral(specifier)) {
        imports.push(specifier.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return imports;
}

function normalizePackageName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('.') || trimmed.startsWith('/')) {
    return null;
  }
  if (trimmed.startsWith('@')) {
    const parts = trimmed.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : trimmed;
  }
  return trimmed.split('/')[0] || null;
}

function looksLikeExternalSdkImport(packageName: string): boolean {
  return (
    !packageName.startsWith('@nestjs/') &&
    !packageName.startsWith('@types/') &&
    !packageName.startsWith('@prisma/') &&
    !packageName.startsWith('node:') &&
    ![
      'fs',
      'path',
      'crypto',
      'util',
      'events',
      'stream',
      'http',
      'https',
      'url',
      'zlib',
      'os',
    ].includes(packageName)
  );
}

function discoverContractsFromOpenApi(rootDir: string): ProviderContract[] {
  const contracts: ProviderContract[] = [];
  const files = walkFiles(rootDir, ['.json']).filter((filePath) =>
    isOpenApiSpecFile(rootDir, filePath),
  );

  for (const filePath of files) {
    let spec: unknown;
    try {
      spec = JSON.parse(readTextFile(filePath, 'utf8'));
    } catch {
      continue;
    }

    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      continue;
    }

    const root = spec as Record<string, unknown>;
    const paths = root.paths;
    if (!paths || typeof paths !== 'object' || Array.isArray(paths)) {
      continue;
    }

    const provider = providerFromOpenApiSpec(root) ?? 'openapi_schema';
    for (const [endpoint, methods] of Object.entries(paths as Record<string, unknown>)) {
      if (!methods || typeof methods !== 'object' || Array.isArray(methods)) {
        continue;
      }

      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        const normalizedMethod = method.toUpperCase();
        if (!HTTP_METHOD_PATTERN.test(normalizedMethod)) {
          continue;
        }

        const operationObject =
          operation && typeof operation === 'object' && !Array.isArray(operation)
            ? (operation as Record<string, unknown>)
            : {};

        contracts.push({
          provider,
          endpoint: normalizeRoute(endpoint),
          method: normalizedMethod,
          expectedRequestSchema: extractOpenApiRequestSchema(operationObject),
          expectedResponseSchema: extractOpenApiResponseSchema(operationObject),
          expectedHeaders: [],
          authType: inferOpenApiAuthType(root, operationObject),
          status: 'generated',
          lastValidated: null,
          issues: [`Discovered from OpenAPI schema ${filePath.replace(rootDir + path.sep, '')}`],
        });
      }
    }
  }

  return contracts;
}

function isOpenApiSpecFile(rootDir: string, filePath: string): boolean {
  const relative = path.relative(rootDir, filePath);
  if (relative.startsWith('..')) {
    return false;
  }

  const parsed = path.parse(filePath);
  if (parsed.ext.toLowerCase() !== '.json') {
    return false;
  }

  const firstNameSegment = parsed.name.toLowerCase().split('.')[0];
  return firstNameSegment === 'openapi' || firstNameSegment === 'swagger';
}
