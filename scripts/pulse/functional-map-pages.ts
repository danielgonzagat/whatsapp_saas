import { safeJoin, safeResolve } from './safe-path';
import * as path from 'path';
import type { PulseConfig } from './types';
import type { PageEntry } from './functional-map-types';
import { walkFiles } from './parsers/utils';
import { pathExists, readTextFile } from './safe-fs';
import { resolveImportPath } from './functional-map.helpers';
import { getFrontendSourceDirs } from './frontend-roots';

// ===== Step 1: Discover all pages =====

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

      // Derive route from directory structure
      const dir = path.dirname(relFromApp);
      let route =
        '/' +
        dir
          .replace(/\(admin\)\/?/g, '')
          .replace(/\(main\)\/?/g, '')
          .replace(/\(public\)\/?/g, '')
          .replace(/\(checkout\)\/?/g, '')
          .replace(/\(auth\)\/?/g, '')
          .replace(/\[\.\.\.(\w+)\]/g, ':$1')
          .replace(/\[(\w+)\]/g, ':$1')
          .replace(/\/+/g, '/')
          .replace(/\/$/, '');

      if (route === '/.' || route === '/') {
        route = '/';
      }

      // Detect route group
      let group = 'other';
      if (relFromApp.startsWith('(admin)')) {
        group = 'admin';
      } else if (relFromApp.startsWith('(main)')) {
        group = 'main';
      } else if (relFromApp.startsWith('(public)')) {
        group = 'public';
      } else if (relFromApp.startsWith('(checkout)')) {
        group = 'checkout';
      } else if (relFromApp.startsWith('e2e')) {
        group = 'e2e';
      } else if (relFromApp.startsWith('api/') || relFromApp.startsWith('auth/')) {
        group = 'api';
      }

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
