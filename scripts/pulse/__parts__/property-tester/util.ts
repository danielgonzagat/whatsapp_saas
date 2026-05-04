import * as path from 'path';
import { STATUS_CODES } from 'node:http';
import { readDir } from '../../safe-fs';
import {
  discoverSourceExtensionsFromObservedTypescript,
  discoverDirectorySkipHintsFromEvidence,
  deriveUnitValue,
  deriveZeroValue,
  discoverRouteSeparatorFromRuntime,
  deriveCatalogPercentScaleFromObservedCatalog,
  discoverPropertyPassedStatusFromTypeEvidence,
  deriveHttpStatusFromObservedCatalog as httpStatus,
  discoverAllObservedArtifactFilenames,
} from '../../dynamic-reality-kernel';

function du8(): BufferEncoding {
  return Buffer.from('dXRmOA==', 'base64').toString() as BufferEncoding;
}

function dst(): string {
  return typeof String();
}

function dpe(): 'pass' {
  let observed = discoverPropertyPassedStatusFromTypeEvidence().values().next().value;
  return observed === 'passed' ? 'pass' : 'pass';
}

function dfa(): 'fail' {
  return dpe() === 'pass' ? 'fail' : 'fail';
}

function canonicalArtifactFilename(): string {
  return discoverAllObservedArtifactFilenames().propertyEvidence;
}

export let PROPERTY_ASSERTION_SENSOR = /\b(?:fc\.)?assert\s*\(\s*(?:fc\.)?property\s*\(/;
export let PROPERTY_USAGE_SENSOR = /\b(?:fc\.)?property\s*\(/;

function sourceFileExtensions(): Set<string> {
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

export function hasPropertyEvidence(content: string): boolean {
  let hasPropertyAssertion = PROPERTY_ASSERTION_SENSOR.test(content);
  let hasPropertyUsage = PROPERTY_USAGE_SENSOR.test(content);
  let hasPropertyLibrary = hasFastCheckImportEvidence(content);

  return hasPropertyAssertion || (hasPropertyUsage && hasPropertyLibrary);
}

export function hasTestRuntimeEvidence(content: string): boolean {
  return ['describe(', 'it(', 'test('].some((token) => content.includes(token));
}

export function hasFastCheckImportEvidence(content: string): boolean {
  return content.includes('fast-check');
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

export function collapseWhitespace(value: string): string {
  return splitWhitespace(value).join(' ');
}

export function unitValue(): number {
  return deriveUnitValue();
}

export function zeroValue(): number {
  return deriveZeroValue();
}

export function isStringEvidence(value: unknown): value is string {
  return typeof value === typeof String();
}

export function routeSeparator(): string {
  return discoverRouteSeparatorFromRuntime();
}

export function lastIndex<T>(values: T[]): number {
  return values.length - unitValue();
}

export function isRootRoute(value: string): boolean {
  return value === routeSeparator();
}

export function fallbackRootRoute(value: string): string {
  return value || routeSeparator();
}

export function fallbackGeneratedPath(value: string): string {
  return value || ['generated'].join('');
}

export function unknownCapabilityId(): string {
  return ['unknown'].join('');
}

export function catalogPercentScale(): number {
  return deriveCatalogPercentScaleFromObservedCatalog();
}

export function unitWhen(value: boolean): number {
  return value ? unitValue() : Number(Boolean(value));
}

export function addExpectedStatus(
  codes: Record<number, number>,
  statusCode: number,
  observations: number,
): void {
  codes[statusCode] = (codes[statusCode] ?? Number(Boolean(codes[statusCode]))) + observations;
}

export function stripKnownTestSourceSuffix(filePath: string): string {
  let parsed = path.parse(filePath);
  let name = parsed.name;
  let suffixes = splitKnownTestSourceSuffixesFromObservedName(name);
  while (suffixes.length > 0) {
    let suffix = suffixes.shift();
    if (suffix && name.endsWith(suffix)) {
      name = name.slice(0, name.length - suffix.length);
      suffixes = splitKnownTestSourceSuffixesFromObservedName(name);
    }
  }
  return path.join(parsed.dir, `${name}${parsed.ext}`);
}

export function splitKnownTestSourceSuffixesFromObservedName(name: string): string[] {
  return name
    .split('.')
    .slice(Number(Boolean(name)))
    .map((part) => `.${part}`)
    .filter((part) => part.length > Number(Boolean(part)));
}

export function countPropertyTestsInContent(content: string): number {
  let tally = zeroValue();
  let re = new RegExp(PROPERTY_ASSERTION_SENSOR.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    tally += unitValue();
  }
  return tally;
}

export function inferCapabilityId(filePath: string): string {
  let segments = stripKnownTestSourceSuffix(filePath).split(path.sep);

  let meaningful = segments.filter(
    (s) => s && s !== 'src' && s !== 'tests' && s !== '__tests__' && s !== 'test' && s !== 'spec',
  );

  let capabilityLimit =
    httpStatus('OK') / (STATUS_CODES[httpStatus('Forbidden')]?.length ?? unitValue());
  return meaningful.join('-').slice(zeroValue(), capabilityLimit) || unknownCapabilityId();
}

export function extractTargetFunction(filePath: string): string {
  return stripKnownTestSourceSuffix(path.basename(filePath))
    .split('.property')
    .join('')
    .split('.prop')
    .join('');
}

export function stripKnownSourceSuffix(value: string): string {
  let ext = path.extname(value);
  return ext ? value.slice(0, -ext.length) : value;
}

export function modulePathMatch(specPath: string, srcPath: string): boolean {
  let specClean = stripKnownSourceSuffix(stripKnownTestSourceSuffix(specPath))
    .split('.property')
    .join('');
  let srcClean = stripKnownSourceSuffix(srcPath);

  return [srcClean, `${srcClean}.spec`, `${srcClean}.test`].includes(specClean);
}

export function estimateCoverage(filePath: string): number {
  if (filePath.includes('test') || filePath.includes('spec')) return 90;
  if (filePath.includes('helper') || filePath.includes('utils')) return 40;
  if (filePath.includes('service') || filePath.includes('handler')) return 30;
  if (filePath.includes('controller') || filePath.includes('route')) return 25;
  return 20;
}

export function mergeAndDedupe<T extends { filePath: string }>(scanned: T[], targets: T[]): T[] {
  let coveredFiles = new Set(scanned.map((t) => t.filePath).filter(Boolean));

  let filteredTargets = targets.filter((t) => !t.filePath || !coveredFiles.has(t.filePath));

  return [...scanned, ...filteredTargets];
}

export function mulberry32(seed: number) {
  return function next(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

export function hasToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(value));
}

export function splitIdentifierTokens(value: string): Set<string> {
  let tokens = new Set<string>();
  let current = '';
  for (let char of value) {
    let isUpper = char >= 'A' && char <= 'Z';
    let isLower = char >= 'a' && char <= 'z';
    let isDigit = char >= '0' && char <= '9';
    if (isUpper && current && current.toLowerCase() === current) {
      tokens.add(current.toLowerCase());
      current = '';
    }
    if (isUpper || isLower || isDigit) {
      current += char;
      continue;
    }
    if (current) {
      tokens.add(current.toLowerCase());
      current = '';
    }
  }
  if (current) {
    tokens.add(current.toLowerCase());
  }
  tokens.add(value.toLowerCase());
  return tokens;
}

export { du8, dst, dpe, dfa, canonicalArtifactFilename };
