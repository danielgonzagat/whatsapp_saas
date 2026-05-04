import * as path from 'path';
import type { UICrawlerStatus, UIDiscoveredElement } from '../../types.ui-crawler';
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin, safeResolve } from '../../safe-path';
import { extractApiEndpoints } from './helpers-endpoints';
import { FRONTEND_SRC } from './constants';

/**
 * Map an element's handler to its implementation file and API endpoint.
 *
 * Given an onClick handler name (e.g. `handleSave`), searches the component
 * file for the function definition, then traces the function body to find
 * API calls (fetch, apiFetch, axios, useMutation, useQuery, etc.).
 *
 * @param element - The discovered element with a handler name.
 * @param filePath - Absolute path to the source file containing the element.
 * @param rootDir  - Repository root directory.
 * @returns The handler's source file and API endpoint if found.
 */
export function mapElementToHandler(
  element: UIDiscoveredElement,
  filePath: string,
  rootDir: string,
): { handlerFile: string | null; apiEndpoint: string | null } {
  let content: string;
  try {
    content = readTextFile(filePath, 'utf8');
  } catch {
    return { handlerFile: null, apiEndpoint: null };
  }

  if (!element.linkedEndpoint) {
    const endpoints = extractApiEndpoints(content);
    if (endpoints.length > 0) {
      return { handlerFile: filePath, apiEndpoint: endpoints[0] };
    }
  }

  const imports = parseImportMap(content, filePath, rootDir);

  if (element.linkedEndpoint) {
    const resolved = resolveImportPathsForEndpoint(element.linkedEndpoint, imports);
    if (resolved) {
      for (const candidate of resolved) {
        if (pathExists(candidate)) {
          const implContent = readTextFile(candidate, 'utf8');
          const implEndpoints = extractApiEndpoints(implContent);
          if (implEndpoints.length > 0) {
            return { handlerFile: candidate, apiEndpoint: implEndpoints[0] };
          }
          return { handlerFile: candidate, apiEndpoint: null };
        }
      }
    }
    return { handlerFile: filePath, apiEndpoint: element.linkedEndpoint };
  }

  if (element.status === 'no_handler' || element.status === 'fake') {
    return { handlerFile: null, apiEndpoint: null };
  }

  return { handlerFile: filePath, apiEndpoint: null };
}

/** Parse the import map from a source file to resolve module paths. */
export function parseImportMap(
  fileContent: string,
  sourceFile: string,
  rootDir: string,
): Map<string, string> {
  const map = new Map<string, string>();
  const frontendDir = safeJoin(rootDir, FRONTEND_SRC);
  const sourceDir = path.dirname(sourceFile);

  const importRe =
    /import\s+(?:\w+(?:\s*,\s*\{[^}]*\})?|\{[^}]+\}|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(fileContent)) !== null) {
    const importPath = m[1];
    const resolved = resolveImportPath(importPath, frontendDir, sourceDir);
    if (resolved) map.set(importPath, resolved);
  }
  return map;
}

/** Resolve a TypeScript import path to a filesystem path. */
export function resolveImportPath(
  importPath: string,
  frontendDir: string,
  sourceDir: string,
): string | null {
  if (importPath.startsWith('@/')) {
    const rel = importPath.slice(2);
    return resolveFileCandidate(safeJoin(frontendDir, rel));
  }
  if (importPath.startsWith('.')) {
    return resolveFileCandidate(safeResolve(sourceDir, importPath));
  }
  if (importPath.startsWith('/')) {
    return resolveFileCandidate(safeJoin(frontendDir, importPath));
  }
  return null;
}

/** Try .ts, .tsx, /index.ts, /index.tsx extensions for a candidate path. */
export function resolveFileCandidate(candidate: string): string | null {
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts', '']) {
    const full = candidate + ext;
    if (pathExists(full)) return full;
  }
  return null;
}

/** Resolve import paths that might point to a file containing the given endpoint. */
export function resolveImportPathsForEndpoint(
  _endpoint: string,
  imports: Map<string, string>,
): string[] {
  const results: string[] = [];
  Array.from(imports.values()).forEach((resolved) => {
    if (resolved.includes('/api/') || resolved.includes('/lib/')) {
      results.push(resolved);
    }
  });
  return results;
}

/**
 * Determine whether a handler appears to be dead (no-op, fake, or missing).
 */
export function classifyHandlerStatus(
  element: UIDiscoveredElement,
  apiEndpoint: string | null,
): { status: UICrawlerStatus; reason: string | null } {
  if (element.status === 'no_handler') {
    return { status: 'no_handler', reason: 'No handler attached' };
  }
  if (element.status === 'fake') {
    return { status: 'fake', reason: element.errorMessage || 'Fake/mock handler' };
  }
  if (!apiEndpoint && element.handlerAttached) {
    return { status: 'no_handler', reason: 'Handler exists but no API endpoint found' };
  }
  return { status: 'works', reason: null };
}
