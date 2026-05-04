import { safeJoin, safeResolve } from './safe-path';
import * as path from 'path';
import type { PulseConfig } from './types';
import type { PageEntry } from './functional-map-types';
import { walkFiles } from './parsers/utils';
import { pathExists, readTextFile } from './safe-fs';
import { resolveImportPath } from './functional-map.helpers';
import { getFrontendSourceDirs } from './frontend-roots';

// ===== Step 1: Discover all pages =====

function isNextRouteGroupSegment(segment: string): boolean {
  return segment.length > 2 && segment.startsWith('(') && segment.endsWith(')');
}

function routeGroupNameFromSegment(segment: string): string | null {
  if (!isNextRouteGroupSegment(segment)) {
    return null;
  }
  return segment.slice(1, -1);
}

function routeSegmentFromAppSegment(segment: string): string | null {
  if (isNextRouteGroupSegment(segment)) {
    return null;
  }

  if (segment.startsWith('[') && segment.endsWith(']')) {
    const inner = segment.slice(1, -1);
    const parameterName = inner.startsWith('...') ? inner.slice(3) : inner;
    return parameterName.length > 0 ? `:${parameterName}` : segment;
  }

  return segment;
}

function routeFromAppRelativePath(relFromApp: string): string {
  const dir = path.dirname(relFromApp).replace(/\\/g, '/');
  const routeSegments = dir
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.')
    .map(routeSegmentFromAppSegment)
    .filter((segment): segment is string => Boolean(segment));

  return routeSegments.length === 0 ? '/' : `/${routeSegments.join('/')}`;
}

function groupFromAppRelativePath(relFromApp: string): string {
  const segments = relFromApp.replace(/\\/g, '/').split('/').filter(Boolean);
  const routeGroup = routeGroupNameFromSegment(segments[0] || '');
  if (routeGroup) {
    return routeGroup;
  }

  const firstRouteSegment = routeSegmentFromAppSegment(segments[0] || '');
  if (!firstRouteSegment) {
    return 'other';
  }
  if (firstRouteSegment === 'e2e') {
    return 'e2e';
  }
  if (firstRouteSegment === 'api' || firstRouteSegment === 'auth') {
    return 'api';
  }
  return 'other';
}

export function findAllPages(config: PulseConfig): PageEntry[] {
  const pages: PageEntry[] = [];

  for (const frontendDir of getFrontendSourceDirs(config)) {
    const appDir = safeJoin(frontendDir, 'app');
    if (!pathExists(appDir)) {
      continue;
    }

    const pageFiles = walkFiles(appDir, ['.tsx']).filter((f) => f.endsWith('/page.tsx'));
    for (const absFile of pageFiles) {
      const relFile = path.relative(config.rootDir, absFile);
      const relFromApp = path.relative(appDir, absFile);

      const route = routeFromAppRelativePath(relFromApp);
      const group = groupFromAppRelativePath(relFromApp);

      // Detect redirect pages
      let isRedirect = false;
      let redirectTarget: string | null = null;
      try {
        const content = readTextFile(absFile, 'utf8');
        const redirectMatch = content.match(/redirect\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
        if (redirectMatch && /import.*redirect/.test(content)) {
          isRedirect = true;
          redirectTarget = redirectMatch[1];
        }
      } catch {
        /* skip */
      }

      // Skip API route handlers (they're not pages)
      if (group === 'api') {
        continue;
      }

      pages.push({
        pageFile: absFile,
        frontendDir,
        relFile,
        route,
        group,
        isRedirect,
        redirectTarget,
      });
    }
  }

  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

// ===== Step 2: Resolve component tree per page =====

/** Resolve component tree. */
export function resolveComponentTree(
  pageFile: string,
  frontendDir: string,
  maxDepth: number = 3,
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function walk(file: string, depth: number) {
    if (depth > maxDepth || visited.has(file)) {
      return;
    }
    if (!pathExists(file)) {
      return;
    }
    visited.add(file);
    result.push(file);

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      return;
    }

    // Static imports: import X from '@/components/...'
    const staticImportRe =
      /import\s+(?:\w+|\{[^}]+\})\s+from\s+['"](@\/(?:components|hooks|lib)\/[^'"]+)['"]/g;
    let m;
    while ((m = staticImportRe.exec(content)) !== null) {
      const resolved = resolveImportPath(m[1], frontendDir);
      if (resolved) {
        walk(resolved, depth + 1);
      }
    }

    // Dynamic imports: dynamic(() => import('@/components/...'))
    const dynamicImportRe = /import\s*\(\s*['"](@\/(?:components|hooks|lib)\/[^'"]+)['"]\s*\)/g;
    while ((m = dynamicImportRe.exec(content)) !== null) {
      const resolved = resolveImportPath(m[1], frontendDir);
      if (resolved) {
        walk(resolved, depth + 1);
      }
    }

    // Relative imports within component files
    const relativeImportRe = /import\s+(?:\w+|\{[^}]+\})\s+from\s+['"](\.\/.+?|\.\.\/.*?)['"]/g;
    while ((m = relativeImportRe.exec(content)) !== null) {
      const importPath = m[1];
      const dir = path.dirname(file);
      const candidate = safeResolve(dir, importPath);
      for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts', '']) {
        const full = candidate + ext;
        if (pathExists(full) && !visited.has(full)) {
          walk(full, depth + 1);
          break;
        }
      }
    }
  }

  walk(pageFile, 0);
  return result;
}
