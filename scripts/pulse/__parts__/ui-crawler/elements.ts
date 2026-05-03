import * as path from 'path';
import type {
  UICrawlerStatus,
  UIDiscoveredElement,
  UIDiscoveredPage,
  UIElementKind,
} from '../../types.ui-crawler';
import {
  deriveStringUnionMembersFromTypeContract,
  deriveZeroValue,
} from '../../dynamic-reality-kernel';
import { ensureDir, pathExists, readDir, readTextFile, writeTextFile } from '../../safe-fs';
import { safeJoin, safeResolve } from '../../safe-path';
import { walkFiles } from '../../parsers/utils';
import { FRONTEND_SRC, APP_DIR, DOM_HANDLER_PROPS } from './constants';
import {
  buildSelector,
  classifyElementRisk,
  classifyRoleFromRoute,
  detectAuthRequired,
  detectElementKind,
  extractApiEndpoints,
  extractFormAction,
  extractHref,
  extractJSXHandler,
  extractLabel,
  isDisabled,
  isExplicitFakeSignal,
  isNavigationHandler,
  routeFromAppDir,
} from './helpers';

/**
 * Discover all Next.js App Router pages under `frontend/src/app/`.
 *
 * Scans the `app/` directory for `page.tsx` files, extracts route patterns
 * from the file-system hierarchy, and determines role and auth requirements.
 *
 * @param rootDir - Repository root directory.
 * @returns Array of discovered pages with empty element lists.
 */
export function discoverPages(rootDir: string): UIDiscoveredPage[] {
  const frontendDir = safeJoin(rootDir, FRONTEND_SRC);
  const appDir = safeJoin(frontendDir, APP_DIR);

  if (!pathExists(appDir)) return [];

  const pageFiles = walkFiles(appDir, ['.tsx']).filter((f) => f.endsWith('/page.tsx'));
  const pages: UIDiscoveredPage[] = [];

  for (const absFile of pageFiles) {
    const relFromApp = path.relative(appDir, absFile);
    const dir = path.dirname(relFromApp);

    const route = routeFromAppDir(dir);

    if (route.startsWith('/api/') || route.startsWith('/auth/') || dir.startsWith('e2e')) continue;

    let content = '';
    try {
      content = readTextFile(absFile, 'utf8');
    } catch {
      continue;
    }

    const isRedirect = /import.*redirect/.test(content) && /redirect\s*\(/.test(content);
    if (isRedirect) continue;

    const role = classifyRoleFromRoute(route);
    const authRequired = detectAuthRequired(absFile, relFromApp, content);

    const titleMatch = content.match(/\/\*\*\s*(.+?)\s*\*\//);
    const title = titleMatch ? titleMatch[1].trim() : route;

    pages.push({
      url: route,
      title,
      role,
      authRequired,
      reachable: true,
      elements: [],
      networkCalls: [],
      consoleErrors: [],
      loadTimeMs: deriveZeroValue(),
    });
  }

  return pages.sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * Resolve component files imported by a page.
 *
 * Many Next.js pages are thin wrappers that import a single component from
 * `@/components/` or `./`. This function follows those imports to discover
 * the actual component files where interactive elements live.
 *
 * @param pageFilePath - Absolute path to the page.tsx file.
 * @param rootDir       - Repository root directory.
 * @param visited       - Set of already-visited paths to prevent cycles.
 * @returns Array of absolute paths to component files.
 */
export function resolveComponentFiles(
  pageFilePath: string,
  rootDir: string,
  visited: Set<string> = new Set(),
): string[] {
  if (visited.has(pageFilePath)) return [];
  visited.add(pageFilePath);

  let content: string;
  try {
    content = readTextFile(pageFilePath, 'utf8');
  } catch {
    return [];
  }

  const frontendDir = safeJoin(rootDir, FRONTEND_SRC);
  const sourceDir = path.dirname(pageFilePath);
  const componentFiles: string[] = [];

  const importRe =
    /import\s+(?:\w+(?:\s*,\s*\{[^}]*\})?|\{[^}]+\}|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    const importPath = m[1];

    if (importPath.startsWith('next/')) continue;
    if (importPath.startsWith('react')) continue;
    if (importPath.startsWith('swr')) continue;
    if (/^(?:@\/lib\/|@\/hooks\/|@\/data\/|@\/utils\/)/.test(importPath)) continue;

    const resolved = resolveImportPath(importPath, frontendDir, sourceDir);
    if (resolved && pathExists(resolved) && !visited.has(resolved)) {
      componentFiles.push(resolved);
      const nested = resolveComponentFiles(resolved, rootDir, visited);
      for (const nf of nested) {
        if (!componentFiles.includes(nf)) {
          componentFiles.push(nf);
        }
      }
    }
  }

  return componentFiles;
}

/**
 * Parse a JSX/TSX file to discover all interactive elements and their handlers.
 *
 * Uses regex-based extraction to find buttons, links, forms, inputs, selects,
 * modals, menus, tabs, and toggles (including shadcn/ui components). For each
 * element, extracts handler names, labels, risk level, and any API endpoints
 * called inline.
 *
 * @param filePath - Absolute path to the JSX/TSX file.
 * @param _pageUrl  - The page URL for risk classification context.
 * @param authRequired - Whether the page requires authentication (for risk).
 * @returns Array of discovered elements found in the file.
 */
export function parseElementsFromFile(
  filePath: string,
  _pageUrl = '/',
  authRequired = false,
): UIDiscoveredElement[] {
  let content: string;
  try {
    content = readTextFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const elements: UIDiscoveredElement[] = [];

  const UIElementKindMembers = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.ui-crawler.ts',
    'UIElementKind',
  );
  const kindCounters: Record<string, number> = {};
  for (const k of UIElementKindMembers) kindCounters[k] = deriveZeroValue();

  function nextIndex(kind: UIElementKind): number {
    return kindCounters[kind]++;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kind = detectElementKind(line);
    if (!kind) continue;

    const label = extractLabel(line, lines, i);
    const disabled = isDisabled(line);

    let handlerName: string | null = null;
    let apiEndpoint: string | null = null;

    if (kind === 'link') {
      const href = extractHref(line);
      if (href) {
        handlerName = `navigate-to:${href}`;
        if (href.startsWith('/api/')) apiEndpoint = href;
      }
    }

    if (kind === 'form') {
      const action = extractFormAction(line);
      if (action && action.startsWith('/api/')) {
        apiEndpoint = action;
      }
    }

    for (const prop of Array.from(DOM_HANDLER_PROPS)) {
      const handler = extractJSXHandler(line, prop);
      if (handler) {
        handlerName = handler;
        const endpoints = extractApiEndpoints(handler);
        if (endpoints.length > 0) apiEndpoint = endpoints[0];
      }
    }

    const idx = nextIndex(kind);

    let status: UICrawlerStatus;
    let errorMessage: string | null = null;

    const statusLabels = deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.ui-crawler.ts',
      'UICrawlerStatus',
    );
    if (!handlerName && kind !== 'input' && kind !== 'select') {
      status = 'no_handler' as UICrawlerStatus;
    } else if (isExplicitFakeSignal(line, handlerName)) {
      status = 'fake' as UICrawlerStatus;
      errorMessage = 'Element carries explicit fake/mock/stub evidence';
    } else if (handlerName && isNavigationHandler(handlerName)) {
      status = 'works' as UICrawlerStatus;
    } else if (handlerName || apiEndpoint) {
      status = 'works' as UICrawlerStatus;
    } else {
      status = 'no_handler' as UICrawlerStatus;
    }

    elements.push({
      selector: buildSelector(kind, label, handlerName, idx),
      kind,
      label,
      visible: true,
      enabled: !disabled,
      actionable: !disabled,
      handlerAttached: Boolean(handlerName),
      status,
      linkedEndpoint: apiEndpoint,
      linkedFilePath: null,
      errorMessage,
      risk: classifyElementRisk({
        kind,
        sourceLine: line,
        handlerName,
        apiEndpoint,
        authRequired,
      }),
    });
  }

  return elements;
}

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

  const skipStatuses = deriveSkipHandlerStatuses();
  if (skipStatuses.has(element.status)) {
    return { handlerFile: null, apiEndpoint: null };
  }

  return { handlerFile: filePath, apiEndpoint: null };
}

/** Parse the import map from a source file to resolve module paths. */
function parseImportMap(
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
function resolveImportPath(
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
function resolveFileCandidate(candidate: string): string | null {
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts', '']) {
    const full = candidate + ext;
    if (pathExists(full)) return full;
  }
  return null;
}

/** Resolve import paths that might point to a file containing the given endpoint. */
function resolveImportPathsForEndpoint(_endpoint: string, imports: Map<string, string>): string[] {
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
  const statuses = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.ui-crawler.ts',
    'UICrawlerStatus',
  );
  if (element.status === ('no_handler' as UICrawlerStatus)) {
    return { status: 'no_handler' as UICrawlerStatus, reason: 'No handler attached' };
  }
  if (element.status === ('fake' as UICrawlerStatus)) {
    return {
      status: 'fake' as UICrawlerStatus,
      reason: element.errorMessage || 'Fake/mock handler',
    };
  }
  if (!apiEndpoint && element.handlerAttached) {
    return {
      status: 'no_handler' as UICrawlerStatus,
      reason: 'Handler exists but no API endpoint found',
    };
  }
  return { status: 'works' as UICrawlerStatus, reason: null };
}
