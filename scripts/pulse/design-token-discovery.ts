import * as path from 'node:path';
import { pathExists, readDir, readTextFile, statPath } from './safe-fs';
import { safeJoin } from './lib/safe-path';

export type DesignTokenSourceKind =
  | 'css-variable'
  | 'tailwind-config'
  | 'token-file'
  | 'theme-file'
  | 'component-primitive-style';

export interface DiscoveredDesignColorEvidence {
  value: string;
  normalizedValue: string;
  sourcePath: string;
  sourceKind: DesignTokenSourceKind;
  line: number;
  tokenName?: string;
}

export interface DesignTokenDiscoveryResult {
  colors: DiscoveredDesignColorEvidence[];
  allowedColors: string[];
  scannedFiles: string[];
}

export interface DesignTokenDiscoveryOptions {
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 6;
const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.mjs',
  '.cjs',
]);

const HEX_COLOR_PATTERN = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const FUNCTION_COLOR_PATTERN =
  /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(\s*[^;{}"'`)\]]+\s*\)/gi;
const CSS_VARIABLE_DECLARATION_PATTERN = /--([A-Za-z0-9_-]+)\s*:\s*([^;{}]+)/g;

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function toRelativePath(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  return normalizeRepoPath(relative || '.');
}

function lineForIndex(content: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) {
      line += 1;
    }
  }
  return line;
}

function normalizeColorValue(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.startsWith('#')) {
    return trimmed.toLowerCase();
  }
  return trimmed
    .replace(/\s*,\s*/g, ', ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .toLowerCase();
}

function isSupportedSourceFile(relativePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function isTailwindConfig(relativePath: string): boolean {
  return /(?:^|\/)tailwind[.]config[.](?:js|cjs|mjs|ts)$/.test(relativePath);
}

function isTokenFile(relativePath: string): boolean {
  return /(?:^|\/)(?:tokens?|design-tokens?)(?:[./_-]|$)/i.test(relativePath);
}

function isThemeFile(relativePath: string): boolean {
  return /(?:^|\/)(?:theme|themes)(?:[./_-]|$)/i.test(relativePath);
}

function isComponentPrimitiveStyleFile(relativePath: string): boolean {
  return /(?:^|\/)(?:components\/(?:ui|primitives)|ui\/(?:components|primitives)|primitives)\/.+[.](?:tsx|ts|jsx|js|css|scss|sass|less)$/i.test(
    relativePath,
  );
}

function classifySource(relativePath: string): DesignTokenSourceKind[] {
  const kinds: DesignTokenSourceKind[] = [];
  if (isTailwindConfig(relativePath)) {
    kinds.push('tailwind-config');
  }
  if (isTokenFile(relativePath)) {
    kinds.push('token-file');
  }
  if (isThemeFile(relativePath)) {
    kinds.push('theme-file');
  }
  if (isComponentPrimitiveStyleFile(relativePath)) {
    kinds.push('component-primitive-style');
  }
  return kinds;
}

function extractColorValues(content: string): Array<{ value: string; index: number }> {
  const matches: Array<{ value: string; index: number }> = [];
  for (const pattern of [HEX_COLOR_PATTERN, FUNCTION_COLOR_PATTERN]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(content);
    while (match) {
      matches.push({ value: match[0], index: match.index });
      match = pattern.exec(content);
    }
  }
  return matches;
}

function extractCssVariableColors(
  content: string,
  sourcePath: string,
): DiscoveredDesignColorEvidence[] {
  const evidence: DiscoveredDesignColorEvidence[] = [];
  CSS_VARIABLE_DECLARATION_PATTERN.lastIndex = 0;
  let variableMatch = CSS_VARIABLE_DECLARATION_PATTERN.exec(content);
  while (variableMatch) {
    const tokenName = variableMatch[1];
    const rawValue = variableMatch[2] ?? '';
    const valueOffset = variableMatch.index + variableMatch[0].indexOf(rawValue);
    for (const color of extractColorValues(rawValue)) {
      evidence.push({
        value: color.value,
        normalizedValue: normalizeColorValue(color.value),
        sourcePath,
        sourceKind: 'css-variable',
        line: lineForIndex(content, valueOffset + color.index),
        tokenName,
      });
    }
    variableMatch = CSS_VARIABLE_DECLARATION_PATTERN.exec(content);
  }
  return evidence;
}

function extractTokenSourceColors(
  content: string,
  sourcePath: string,
  sourceKind: DesignTokenSourceKind,
): DiscoveredDesignColorEvidence[] {
  return extractColorValues(content).map((color) => ({
    value: color.value,
    normalizedValue: normalizeColorValue(color.value),
    sourcePath,
    sourceKind,
    line: lineForIndex(content, color.index),
  }));
}

function discoverCandidateFiles(rootDir: string, maxDepth: number): string[] {
  const files: string[] = [];
  const visit = (relativeDir: string, depth: number): void => {
    if (depth > maxDepth) {
      return;
    }
    const absoluteDir = safeJoin(rootDir, relativeDir);
    if (!pathExists(absoluteDir) || !statPath(absoluteDir).isDirectory()) {
      return;
    }
    for (const entry of readDir(absoluteDir, { withFileTypes: true })) {
      const relativePath = normalizeRepoPath(path.join(relativeDir, entry.name));
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          visit(relativePath, depth + 1);
        }
        continue;
      }
      if (entry.isFile() && isSupportedSourceFile(relativePath)) {
        files.push(relativePath);
      }
    }
  };
  visit('.', 0);
  return files.sort();
}

function uniqueEvidence(
  evidence: DiscoveredDesignColorEvidence[],
): DiscoveredDesignColorEvidence[] {
  const seen = new Set<string>();
  const unique: DiscoveredDesignColorEvidence[] = [];
  for (const item of evidence) {
    const key = [
      item.normalizedValue,
      item.sourcePath,
      item.sourceKind,
      item.line,
      item.tokenName ?? '',
    ].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique.sort((left, right) => {
    if (left.sourcePath !== right.sourcePath) {
      return left.sourcePath.localeCompare(right.sourcePath);
    }
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.normalizedValue.localeCompare(right.normalizedValue);
  });
}

export function discoverDesignTokens(
  rootDir: string,
  options: DesignTokenDiscoveryOptions = {},
): DesignTokenDiscoveryResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const evidence: DiscoveredDesignColorEvidence[] = [];
  const scannedFiles: string[] = [];

  for (const relativePath of discoverCandidateFiles(rootDir, maxDepth)) {
    const absolutePath = safeJoin(rootDir, relativePath);
    const sourcePath = toRelativePath(rootDir, absolutePath);
    const content = readTextFile(absolutePath, 'utf8');
    const sourceKinds = classifySource(sourcePath);
    const cssVariableEvidence = extractCssVariableColors(content, sourcePath);

    if (cssVariableEvidence.length > 0) {
      scannedFiles.push(sourcePath);
      evidence.push(...cssVariableEvidence);
    }

    for (const sourceKind of sourceKinds) {
      const tokenEvidence = extractTokenSourceColors(content, sourcePath, sourceKind);
      if (tokenEvidence.length > 0) {
        scannedFiles.push(sourcePath);
        evidence.push(...tokenEvidence);
      }
    }
  }

  const colors = uniqueEvidence(evidence);
  return {
    colors,
    allowedColors: [...new Set(colors.map((color) => color.normalizedValue))].sort(),
    scannedFiles: [...new Set(scannedFiles)].sort(),
  };
}

export function isDiscoveredDesignColor(
  value: string,
  discovery: DesignTokenDiscoveryResult,
): boolean {
  return discovery.allowedColors.includes(normalizeColorValue(value));
}

export function findDiscoveredDesignColorEvidence(
  value: string,
  discovery: DesignTokenDiscoveryResult,
): DiscoveredDesignColorEvidence[] {
  const normalizedValue = normalizeColorValue(value);
  return discovery.colors.filter((color) => color.normalizedValue === normalizedValue);
}
