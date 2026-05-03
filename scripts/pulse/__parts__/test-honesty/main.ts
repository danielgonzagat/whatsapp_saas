import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

export interface PlaceholderTestResult {
  count: number;
  files: string[];
}

export interface WeakAssertionResult {
  count: number;
  files: string[];
  rawSignals: WeakAssertionRawSignal[];
}

export interface WeakAssertionRawSignal {
  file: string;
  evidenceKind: 'ast';
  truthMode: 'weak_assertion';
  blocking: true;
}

export interface TypeEscapeHatchResult {
  count: number;
  locations: string[];
}

import {
  hasPlaceholderEvidence,
  hasWeakAssertionEvidence,
  walkSourceFiles,
  isInTestDirectory,
} from './ast-detection';

const TYPE_ESCAPE_PATTERNS: { marker: string; label: string; requiresWordBoundary?: boolean }[] = [
  { marker: 'as any', label: 'as any', requiresWordBoundary: true },
  { marker: '@ts-ignore', label: '@ts-ignore' },
  { marker: '@ts-expect-error', label: '@ts-expect-error' },
  {
    marker: '// eslint-disable @typescript-eslint/no-explicit-any',
    label: 'eslint-disable no-explicit-any',
  },
  {
    marker: '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    label: 'eslint-disable-next-line no-explicit-any',
  },
];

function isSourceFile(fileName: string): boolean {
  return ['.ts', '.tsx'].includes(path.extname(fileName));
}

function isTestFileName(fileName: string): boolean {
  if (!isSourceFile(fileName)) {
    return false;
  }
  const extension = path.extname(fileName);
  const stem = extension ? fileName.slice(0, -extension.length) : fileName;
  const tokens: string[] = [];
  let current = '';
  for (const char of stem) {
    if (char === '.' || char === '_' || char === '-') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char.toLowerCase();
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  const tokenSet = new Set(tokens);
  return ['spec', 'test'].some((token) => tokenSet.has(token));
}

function parseTypeScriptFile(filePath: string): ts.SourceFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
}

function hasMarkerAt(line: string, marker: string, index: number): boolean {
  return line.slice(index, index + marker.length) === marker;
}

function hasIdentifierBoundary(line: string, index: number, marker: string): boolean {
  const before = index > 0 ? line[index - 1] : '';
  const afterIndex = index + marker.length;
  const after = afterIndex < line.length ? line[afterIndex] : '';
  return !isIdentifierCharacter(before) && !isIdentifierCharacter(after);
}

function isIdentifierCharacter(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const code = value.charCodeAt(0);
  const isLower = code >= 97 && code <= 122;
  const isUpper = code >= 65 && code <= 90;
  const isDigit = code >= 48 && code <= 57;
  return isLower || isUpper || isDigit || value === '_' || value === '$';
}

function lineMatchesTypeEscape(
  line: string,
  pattern: { marker: string; requiresWordBoundary?: boolean },
): boolean {
  for (let index = 0; index <= line.length - pattern.marker.length; index += 1) {
    if (!hasMarkerAt(line, pattern.marker, index)) {
      continue;
    }
    if (pattern.requiresWordBoundary && !hasIdentifierBoundary(line, index, pattern.marker)) {
      continue;
    }
    return true;
  }
  return false;
}

export function detectPlaceholderTests(rootDir: string): PlaceholderTestResult {
  const files = walkSourceFiles(rootDir, (_relativePath, fileName) => isTestFileName(fileName))
    .filter((candidate) => hasPlaceholderEvidence(parseTypeScriptFile(candidate.absolutePath)))
    .map((candidate) => candidate.relativePath);

  return { count: files.length, files };
}

export function detectWeakStatusAssertions(rootDir: string): WeakAssertionResult {
  const files: string[] = [];
  const rawSignals: WeakAssertionRawSignal[] = [];
  const candidates = walkSourceFiles(rootDir, (_relativePath, fileName) =>
    isTestFileName(fileName),
  );

  for (const candidate of candidates) {
    if (!hasWeakAssertionEvidence(parseTypeScriptFile(candidate.absolutePath))) {
      continue;
    }
    files.push(candidate.relativePath);
    rawSignals.push({
      file: candidate.relativePath,
      evidenceKind: 'ast',
      truthMode: 'weak_assertion',
      blocking: true,
    });
  }

  return { count: files.length, files, rawSignals };
}

export function detectTypeEscapeHatches(rootDir: string): TypeEscapeHatchResult {
  const locations: string[] = [];
  const candidates = walkSourceFiles(
    rootDir,
    (relativePath, fileName) =>
      isSourceFile(fileName) && !isTestFileName(fileName) && !isInTestDirectory(relativePath),
  );

  for (const candidate of candidates) {
    const lines = fs.readFileSync(candidate.absolutePath, 'utf-8').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      for (const pattern of TYPE_ESCAPE_PATTERNS) {
        if (lineMatchesTypeEscape(lines[index], pattern)) {
          locations.push(`${candidate.relativePath}:${index + 1} (${pattern.label})`);
        }
      }
    }
  }

  return { count: locations.length, locations };
}
