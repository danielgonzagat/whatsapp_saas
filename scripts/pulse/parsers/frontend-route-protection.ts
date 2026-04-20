import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

/**
 * Check if middleware.ts covers the (main) group — i.e., all pages under app/(main)/.
 *
 * Strategy:
 * 1. If middleware.ts does not exist → flag every page under app/(main)/ as unprotected.
 * 2. If middleware.ts exists but doesn't reference '(main)' nor a catch-all auth guard
 *    that would capture non-public routes → flag pages that don't start with PUBLIC_PREFIXES.
 * 3. If middleware.ts exists and has a broad auth guard (any pathname that is not in a
 *    public list gets redirected) → all (main) pages are considered protected.
 */

// Public path prefixes that middleware explicitly excludes from auth
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/onboarding',
  '/onboarding-chat',
  '/terms',
  '/privacy',
  '/pay/',
  '/api/',
  '/e2e/',
  '/_next/',
  '/favicon',
  '/icon',
];

function deriveUrlPath(filePath: string, appDir: string): string {
  // filePath: /abs/path/to/frontend/src/app/(main)/dashboard/page.tsx
  // We want: /dashboard (strip the (group) segment)
  const rel = path.relative(appDir, filePath);
  const parts = rel.split(path.sep);

  // Remove 'page.tsx' or 'page.ts' from the end
  if (parts[parts.length - 1].startsWith('page.')) {
    parts.pop();
  }

  // Filter out Next.js route group segments like (main), (auth), etc.
  const filtered = parts.filter((p) => !/^\(.*\)$/.test(p));

  const urlPath = '/' + filtered.join('/');
  return urlPath;
}

function isPublicPath(urlPath: string): boolean {
  if (urlPath === '/') {
    return true;
  }
  return PUBLIC_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
}

/**
 * Detect if middleware.ts implements a broad auth guard:
 * - redirects to /login for unrecognized paths
 * - AND uses a cookie/session check pattern
 */
function hasAuthGuard(content: string): boolean {
  // Must redirect to /login
  const redirectsToLogin =
    /\/login/.test(content) && /redirect\(|NextResponse\.redirect/.test(content);
  // Must check some auth token/cookie
  const checksAuth = /cookies|cookie|getToken|session|hasAuth|jwt|Bearer|Authorization/i.test(
    content,
  );
  return redirectsToLogin && checksAuth;
}

/** Check frontend route protection. */
export function checkFrontendRouteProtection(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const middlewarePath = path.join(config.frontendDir, 'src', 'middleware.ts');
  const middlewareExists = fs.existsSync(middlewarePath);

  let middlewareContent = '';
  if (middlewareExists) {
    try {
      middlewareContent = fs.readFileSync(middlewarePath, 'utf8');
    } catch {
      middlewareContent = '';
    }
  }

  const appDir = path.join(config.frontendDir, 'src', 'app');
  const mainDir = path.join(appDir, '(main)');

  // Find all page.tsx files under app/(main)/
  const pageFiles = walkFiles(mainDir, ['.tsx', '.ts']).filter((f) =>
    path.basename(f).startsWith('page.'),
  );

  if (pageFiles.length === 0) {
    return breaks;
  }

  // Case 1: middleware doesn't exist
  if (!middlewareExists) {
    for (const file of pageFiles) {
      const urlPath = deriveUrlPath(file, appDir);
      if (isPublicPath(urlPath)) {
        continue;
      }
      breaks.push({
        type: 'FRONTEND_ROUTE_UNPROTECTED',
        severity: 'high',
        file: path.relative(config.rootDir, file),
        line: 1,
        description: `Page '${urlPath}' has no middleware protection (middleware.ts missing)`,
        detail: `Create src/middleware.ts with an auth guard redirecting unauthenticated users to /login.`,
      });
    }
    return breaks;
  }

  // Case 2: middleware exists and has a broad auth guard covering (main)
  // Check: does middleware have a guard that would cover all non-public paths?
  const coversMain =
    hasAuthGuard(middlewareContent) ||
    /\(main\)/.test(middlewareContent) ||
    /startsWith\(['"`]\/\(main\)['"`]\)/.test(middlewareContent);

  if (coversMain) {
    // All (main) pages are protected — no breaks
    return breaks;
  }

  // Case 3: middleware exists but its coverage is unclear — flag pages not in PUBLIC_PREFIXES
  // Only flag if the middleware doesn't appear to do any auth at all
  const hasAnyAuthLogic = /cookie|session|getToken|jwt|Authorization|redirect.*login/i.test(
    middlewareContent,
  );

  if (!hasAnyAuthLogic) {
    for (const file of pageFiles) {
      const urlPath = deriveUrlPath(file, appDir);
      if (isPublicPath(urlPath)) {
        continue;
      }
      breaks.push({
        type: 'FRONTEND_ROUTE_UNPROTECTED',
        severity: 'high',
        file: path.relative(config.rootDir, file),
        line: 1,
        description: `Page '${urlPath}' may not be protected — middleware.ts has no apparent auth logic`,
        detail: `Ensure middleware.ts redirects unauthenticated users to /login for protected routes.`,
      });
    }
  }

  return breaks;
}
