import * as path from 'path';
import type { UIDiscoveredPage } from '../../types.ui-crawler';
import { ensureDir, pathExists, readDir, readTextFile, writeTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { walkFiles } from '../../parsers/utils';
import { FRONTEND_SRC, APP_DIR } from './constants';
import { classifyRoleFromRoute } from './role';
import { detectAuthRequired, routeFromAppDir } from './auth';
import { resolveImportPath } from './handler-mapper';

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
      loadTimeMs: 0,
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

/** Find the page.tsx file for a given route in the App Router. */
export function findPageFile(appDir: string, url: string): string | null {
  const normalizedUrl = url === '/' ? '' : url.startsWith('/') ? url.slice(1) : url;
  const segments = normalizedUrl ? normalizedUrl.split('/') : [];

  const routeGroups = discoverRouteGroups(appDir);
  const candidates: string[] = [];

  candidates.push(safeJoin(appDir, ...segments, 'page.tsx'));
  for (const group of routeGroups) {
    const candidate = safeJoin(appDir, group, ...segments, 'page.tsx');
    candidates.push(candidate);
  }

  if (segments.length === 0) {
    candidates.push(safeJoin(appDir, 'page.tsx'));
    for (const group of routeGroups) {
      candidates.push(safeJoin(appDir, group, 'page.tsx'));
    }
  }

  for (const candidate of candidates) {
    if (pathExists(candidate)) return candidate;
  }

  return null;
}

export function discoverRouteGroups(appDir: string): string[] {
  if (!pathExists(appDir)) {
    return [];
  }

  try {
    return (readDir(appDir, { withFileTypes: true }) as { name: string; isDirectory(): boolean }[])
      .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}
