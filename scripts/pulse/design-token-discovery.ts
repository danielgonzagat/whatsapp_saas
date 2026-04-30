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

const FUNCTION_COLOR_NAMES = [
  'rgba',
  'rgb',
  'hsla',
  'hsl',
  'oklch',
  'oklab',
  'color',
  'lab',
  'lch',
];

function normalizeRepoPath(filePath: string): string {
  const slashNormalized = filePath.split('\\').join('/');
  return slashNormalized.startsWith('./') ? slashNormalized.slice(2) : slashNormalized;
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
  const trimmed = collapseWhitespace(value.trim());
  if (trimmed.startsWith('#')) {
    return trimmed.toLowerCase();
  }
  return trimmed
    .split(',')
    .map((part) => part.trim())
    .join(', ')
    .replace('( ', '(')
    .replace(' )', ')')
    .toLowerCase();
}

function collapseWhitespace(value: string): string {
  let output = '';
  let previousWasWhitespace = false;
  for (const ch of value) {
    const isWhitespace =
      ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
    if (isWhitespace) {
      if (!previousWasWhitespace) {
        output += ' ';
      }
      previousWasWhitespace = true;
      continue;
    }
    output += ch;
    previousWasWhitespace = false;
  }
  return output;
}

function isSupportedSourceFile(relativePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function isTailwindConfig(relativePath: string): boolean {
  const basename = path.basename(relativePath).toLowerCase();
  return [
    'tailwind.config.js',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
    'tailwind.config.ts',
  ].includes(basename);
}

function isTokenFile(relativePath: string): boolean {
  return normalizeRepoPath(relativePath)
    .toLowerCase()
    .split('/')
    .some((part) => {
      const normalized = part.split('.').join('-').split('_').join('-');
      return (
        normalized === 'token' ||
        normalized === 'tokens' ||
        normalized === 'design-token' ||
        normalized === 'design-tokens'
      );
    });
}

function isThemeFile(relativePath: string): boolean {
  return normalizeRepoPath(relativePath)
    .toLowerCase()
    .split('/')
    .some((part) => {
      const normalized = part.split('.').join('-').split('_').join('-');
      return normalized === 'theme' || normalized === 'themes';
    });
}

function isComponentPrimitiveStyleFile(relativePath: string): boolean {
  const normalized = normalizeRepoPath(relativePath).toLowerCase();
  const parts = normalized.split('/');
  const extension = path.extname(normalized);
  const supportedStyleExtensions = [
    '.tsx',
    '.ts',
    '.jsx',
    '.js',
    '.css',
    '.scss',
    '.sass',
    '.less',
  ];
  if (!supportedStyleExtensions.includes(extension)) {
    return false;
  }
  return parts.some(
    (part, index) =>
      part === 'primitives' ||
      (part === 'components' && (parts[index + 1] === 'ui' || parts[index + 1] === 'primitives')) ||
      (part === 'ui' && (parts[index + 1] === 'components' || parts[index + 1] === 'primitives')),
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
  matches.push(...extractHexColorValues(content));
  matches.push(...extractFunctionColorValues(content));
  return matches;
}

function extractCssVariableColors(
  content: string,
  sourcePath: string,
): DiscoveredDesignColorEvidence[] {
  const evidence: DiscoveredDesignColorEvidence[] = [];
  for (const variableMatch of extractCssVariableDeclarations(content)) {
    const { tokenName, rawValue, valueOffset } = variableMatch;
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
  }
  return evidence;
}

function isHexChar(ch: string | undefined): boolean {
  if (!ch) {
    return false;
  }
  return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}

function isIdentifierChar(ch: string | undefined): boolean {
  if (!ch) {
    return false;
  }
  return (
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z') ||
    (ch >= '0' && ch <= '9') ||
    ch === '_' ||
    ch === '-'
  );
}

function extractHexColorValues(content: string): Array<{ value: string; index: number }> {
  const matches: Array<{ value: string; index: number }> = [];
  let cursor = 0;
  while (cursor < content.length) {
    const index = content.indexOf('#', cursor);
    if (index === -1) {
      break;
    }
    let end = index + 1;
    while (isHexChar(content[end])) {
      end += 1;
    }
    const hexLength = end - index - 1;
    if ([3, 4, 6, 8].includes(hexLength) && !isHexChar(content[end])) {
      matches.push({ value: content.slice(index, end), index });
    }
    cursor = Math.max(end, index + 1);
  }
  return matches;
}

function extractFunctionColorValues(content: string): Array<{ value: string; index: number }> {
  const matches: Array<{ value: string; index: number }> = [];
  const lowerContent = content.toLowerCase();
  for (const colorName of FUNCTION_COLOR_NAMES) {
    let cursor = 0;
    const invocation = `${colorName}(`;
    while (cursor < lowerContent.length) {
      const index = lowerContent.indexOf(invocation, cursor);
      if (index === -1) {
        break;
      }
      if (isIdentifierChar(lowerContent[index - 1])) {
        cursor = index + invocation.length;
        continue;
      }
      const end = content.indexOf(')', index + invocation.length);
      if (
        end !== -1 &&
        !containsAny(content.slice(index, end), [';', '{', '}', '"', "'", '`', ']'])
      ) {
        matches.push({ value: content.slice(index, end + 1), index });
      }
      cursor = index + invocation.length;
    }
  }
  return matches;
}

function containsAny(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token));
}

function extractCssVariableDeclarations(
  content: string,
): Array<{ tokenName: string; rawValue: string; valueOffset: number }> {
  const declarations: Array<{ tokenName: string; rawValue: string; valueOffset: number }> = [];
  let cursor = 0;
  while (cursor < content.length) {
    const start = content.indexOf('--', cursor);
    if (start === -1) {
      break;
    }
    let nameEnd = start + 2;
    while (isIdentifierChar(content[nameEnd])) {
      nameEnd += 1;
    }
    const tokenName = content.slice(start + 2, nameEnd);
    let colonIndex = nameEnd;
    while (
      colonIndex < content.length &&
      content[colonIndex] !== ':' &&
      content[colonIndex] !== ';' &&
      content[colonIndex] !== '{' &&
      content[colonIndex] !== '}'
    ) {
      colonIndex += 1;
    }
    if (tokenName && content[colonIndex] === ':') {
      let valueStart = colonIndex + 1;
      while (valueStart < content.length && content[valueStart] === ' ') {
        valueStart += 1;
      }
      let valueEnd = valueStart;
      while (
        valueEnd < content.length &&
        content[valueEnd] !== ';' &&
        content[valueEnd] !== '{' &&
        content[valueEnd] !== '}'
      ) {
        valueEnd += 1;
      }
      declarations.push({
        tokenName,
        rawValue: content.slice(valueStart, valueEnd),
        valueOffset: valueStart,
      });
      cursor = valueEnd + 1;
      continue;
    }
    cursor = start + 2;
  }
  return declarations;
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
import "./__companions__/design-token-discovery.companion";
