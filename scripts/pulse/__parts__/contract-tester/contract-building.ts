import * as ts from 'typescript';

import type { ProviderContract } from '../../types.contract-tester';
import { readTextFile } from '../../safe-fs';
import { walkFiles } from '../../parsers/utils';
import {
  parseSourceFile,
  uniqueStrings,
  normalizePackageName,
  findBackendDir,
  surroundingText,
} from './helpers';
import { discoverContracts } from './discovery';

// ---------------------------------------------------------------------------
// Build expected contracts
// ---------------------------------------------------------------------------

export function buildExpectedContracts(rootDir: string): ProviderContract[] {
  return discoverContracts(rootDir);
}

// ---------------------------------------------------------------------------
// Merge contracts
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Auth and header inference
// ---------------------------------------------------------------------------

export function inferExpectedHeaders(content: string, url: string): string[] {
  const context = surroundingText(content, url, 500);
  const headers = new Set<string>();
  for (const match of context.matchAll(/['"`]([A-Za-z0-9-]+)['"`]\s*:/g)) {
    const header = match[1];
    if (/^(authorization|content-type|x-[a-z0-9-]+|accept)$/i.test(header)) {
      headers.add(header);
    }
  }
  return [...headers];
}

export function inferAuthType(content: string, url: string): ProviderContract['authType'] {
  const context = surroundingText(content, url, 500);
  if (/signature|x-hub|x-signature/i.test(context)) return 'webhook_signature';
  if (/Bearer\s+|Authorization/i.test(context)) return 'bearer';
  if (/api[-_]?key|access[-_]?token|secret/i.test(context)) return 'api_key';
  if (/oauth/i.test(context)) return 'oauth2';
  return 'none';
}

// ---------------------------------------------------------------------------
// Contract test case generation
// ---------------------------------------------------------------------------

export function generateContractTestCases(contracts: ProviderContract[]): number {
  let count = 0;

  for (const contract of contracts) {
    if (contract.status === 'generated' || contract.status === 'unknown') {
      contract.status = 'generated';
      if (!contract.issues.includes('Contract test case generated — awaiting live execution')) {
        contract.issues.push('Contract test case generated — awaiting live execution');
      }
      count++;
    }
  }

  return count;
}
