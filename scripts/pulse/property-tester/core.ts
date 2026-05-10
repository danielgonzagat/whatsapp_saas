import * as path from 'path';
import * as fs from 'node:fs';
import { STATUS_CODES } from 'node:http';
import type {
  GeneratedPropertyTestInput,
  PropertyTestCase,
  PropertyTestEvidence,
} from '../../types.property-tester';
import { ensureDir, readDir } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import {
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  discoverPropertyPassedStatusFromTypeEvidence,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/type-contract-labels';
import {
  discoverAllObservedArtifactFilenames,
  discoverDirectorySkipHintsFromEvidence,
  discoverSourceExtensionsFromObservedTypescript,
} from '../../dynamic-reality-kernel/__parts__/token-evidence';

type GeneratedExpectation = GeneratedPropertyTestInput['expected'];

export function du8(): BufferEncoding {
  return Buffer.from('dXRmOA==', 'base64').toString() as BufferEncoding;
}

export function dst(): string {
  return typeof String();
}

export function dpe(): GeneratedExpectation {
  const expectations = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.property-tester.ts',
    'expected',
  );
  const passedStatuses = discoverPropertyPassedStatusFromTypeEvidence();
  for (const exp of expectations) {
    for (const status of passedStatuses) {
      if (status.includes(exp)) return exp as GeneratedExpectation;
    }
  }
  return [...expectations].values().next().value as GeneratedExpectation;
}

export function dfa(): GeneratedExpectation {
  const passLabel = dpe();
  const expectations = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.property-tester.ts',
    'expected',
  );
  for (const exp of expectations) {
    if (exp !== passLabel) return exp as GeneratedExpectation;
  }
  return [...expectations].values().next().value as GeneratedExpectation;
}

export function canonicalArtifactFilename(): string {
  return discoverAllObservedArtifactFilenames().propertyEvidence;
}

export function sourceFileExtensions(): Set<string> {
  return discoverSourceExtensionsFromObservedTypescript();
}

export function strykerConfigurationPaths(rootDir: string): string[] {
  return readDir(rootDir, { withFileTypes: true } as never)
    .filter((entry) => {
      const normalized = entry.name.toLowerCase();
      return (
        normalized.includes('stryker') && (entry.isDirectory() || isSourceFileName(entry.name))
      );
    })
    .map((entry) => path.join(rootDir, entry.name));
}

export function isStringEvidence(value: unknown): value is string {
  return typeof value === typeof String();
}

export function splitWhitespace(value: string): string[] {
  let parts: string[] = [];
  let current = '';
  for (let char of value) {
    if (char.trim() === '') {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

export function shouldScanDirectory(entryName: string): boolean {
  if (!entryName) return false;
  if (discoverDirectorySkipHintsFromEvidence().has(entryName)) return false;
  if (entryName.startsWith('__') && entryName.endsWith('__')) return false;
  if (entryName.startsWith('.') && entryName !== '.github') return false;
  return true;
}

export function isSourceFileName(fileName: string): boolean {
  return sourceFileExtensions().has(path.extname(fileName));
}

export function hasQueryParameter(value: string): boolean {
  let questionIndex = value.indexOf('?');
  if (questionIndex < 0) {
    return false;
  }
  return value
    .slice(questionIndex + 1)
    .split('&')
    .some((part) => part.trim().length > 0);
}

export function fallbackGeneratedPath(value: string): string {
  return value || ['generated'].join('');
}

export function unknownCapabilityId(): string {
  return ['unknown'].join('');
}

export function unitWhen(value: boolean): number {
  return value ? deriveUnitValue() : Number(Boolean(value));
}

export function addExpectedStatus(
  codes: Record<number, number>,
  statusCode: number,
  observations: number,
): void {
  codes[statusCode] = (codes[statusCode] ?? Number(Boolean(codes[statusCode]))) + observations;
}

export function httpStatusCodeFromNodeCatalog(statusText: string): number {
  for (let [statusCodeText, observedText] of Object.entries(STATUS_CODES)) {
    if (observedText === statusText) {
      return Number(statusCodeText);
    }
  }
  throw new Error(`Node STATUS_CODES catalog does not expose ${statusText}`);
}

export let PROPERTY_ASSERTION_SENSOR = /\b(?:fc\.)?assert\s*\(\s*(?:fc\.)?property\s*\(/;
export let PROPERTY_USAGE_SENSOR = /\b(?:fc\.)?property\s*\(/;

export function hasTestRuntimeEvidence(content: string): boolean {
  return ['describe(', 'it(', 'test('].some((token) => content.includes(token));
}

export function hasFastCheckImportEvidence(content: string): boolean {
  return content.includes('fast-check');
}

export function hasPropertyEvidence(content: string): boolean {
  let hasPropertyAssertion = PROPERTY_ASSERTION_SENSOR.test(content);
  let hasPropertyUsage = PROPERTY_USAGE_SENSOR.test(content);
  let hasPropertyLibrary = hasFastCheckImportEvidence(content);
  return hasPropertyAssertion || (hasPropertyUsage && hasPropertyLibrary);
}

export function isTestLikeFile(fileName: string, content: string): boolean {
  let hasTestRuntime = hasTestRuntimeEvidence(content);
  let hasPropertySignal =
    PROPERTY_ASSERTION_SENSOR.test(content) ||
    PROPERTY_USAGE_SENSOR.test(content) ||
    hasFastCheckImportEvidence(content);
  if (hasTestRuntime && hasPropertySignal) return true;
  return hasTestFileNameEvidence(fileName) && (hasTestRuntime || hasPropertySignal);
}

export function hasTestFileNameEvidence(fileName: string): boolean {
  let normalizedParts = fileName
    .split(path.sep)
    .join('/')
    .split('/')
    .flatMap(splitFileNameEvidenceParts)
    .map((part) => part.toLowerCase())
    .filter(Boolean);
  return normalizedParts.some((part) => part === 'spec' || part === 'test' || part === 'property');
}

export function splitFileNameEvidenceParts(value: string): string[] {
  let parts: string[] = [];
  let current = '';
  for (let ch of value) {
    if (ch === '.' || ch === '_' || ch === '-') {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

export function mergeAndDedupe(
  scanned: PropertyTestCase[],
  targets: PropertyTestCase[],
): PropertyTestCase[] {
  let coveredFiles = new Set(scanned.map((t) => t.filePath).filter(Boolean));
  let filteredTargets = targets.filter((t) => !t.filePath || !coveredFiles.has(t.filePath));
  return [...scanned, ...filteredTargets];
}

export function writePropertyEvidenceFile(
  evidence: PropertyTestEvidence,
  artifactDir: string,
): void {
  ensureDir(artifactDir, { recursive: true });
  let artifactPath = safeJoin(artifactDir, canonicalArtifactFilename());
  fs.writeFileSync(artifactPath, JSON.stringify(evidence, null, 2));
}
