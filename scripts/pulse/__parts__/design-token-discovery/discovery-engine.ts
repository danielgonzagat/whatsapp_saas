import * as path from 'node:path';
import { pathExists, readDir, readTextFile, statPath } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import {
  isSupportedSourceFile,
  classifySource,
  extractCssVariableColors,
  extractTokenSourceColors,
} from './extract-helpers';
import type {
  DiscoveredDesignColorEvidence,
  DesignTokenDiscoveryResult,
  DesignTokenDiscoveryOptions,
} from './types';

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

function normalizeRepoPath(filePath: string): string {
  const slashNormalized = filePath.split('\\').join('/');
  return slashNormalized.startsWith('./') ? slashNormalized.slice(2) : slashNormalized;
}

function toRelativePath(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  return normalizeRepoPath(relative || '.');
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
    if (left.sourcePath !== right.sourcePath)
      return left.sourcePath.localeCompare(right.sourcePath);
    if (left.line !== right.line) return left.line - right.line;
    return left.normalizedValue.localeCompare(right.normalizedValue);
  });
}

export function discoverCandidateFiles(rootDir: string, maxDepth: number): string[] {
  const files: string[] = [];
  const visit = (relativeDir: string, depth: number): void => {
    if (depth > maxDepth) return;
    const absoluteDir = safeJoin(rootDir, relativeDir);
    if (!pathExists(absoluteDir) || !statPath(absoluteDir).isDirectory()) return;
    for (const entry of readDir(absoluteDir, { withFileTypes: true })) {
      const relativePath = normalizeRepoPath(path.join(relativeDir, entry.name));
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) visit(relativePath, depth + 1);
        continue;
      }
      if (entry.isFile() && isSupportedSourceFile(relativePath)) files.push(relativePath);
    }
  };
  visit('.', 0);
  return files.sort();
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
