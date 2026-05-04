/**
 * PULSE Parser 67: SSR Render Tester
 * Layer 9: Frontend Health
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Make real HTTP requests to public Next.js pages and verify they render without errors.
 * Only tests pages that don't require auth (/, /login, /register) — auth-protected
 * pages would just redirect and are not the concern here.
 *
 * For each public page:
 * 1. HTTP GET to PULSE_FRONTEND_URL + page path
 * 2. Verify status is 200 (not 500 or other error)
 * 3. Verify response contains <html> tag (is actual HTML)
 * 4. Verify response does NOT contain Next.js / React error markers
 * 5. Verify response body is > 1000 bytes (not empty shell)
 *
 * Auth-protected pages: hitting /dashboard without auth → expect redirect (302/307), NOT 500
 *
 * BREAK TYPES:
 * - PAGE_RENDER_BROKEN (critical) — page returns 500, contains error message, or is empty
 */

import type { Break, PulseConfig } from '../types';
import { getFrontendUrl } from './runtime-utils';
import * as path from 'path';
import * as ts from 'typescript';
import { pathExists, readTextFile } from '../safe-fs';
import { safeJoin } from '../safe-path';
import { walkFiles } from './utils';

interface RenderRouteInventory {
  publicRoutes: string[];
  protectedRoutes: string[];
}

function splitIdentifierTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  let current = '';
  for (const char of value) {
    const isAlphaNumeric =
      (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9');
    if (!isAlphaNumeric) {
      if (current) {
        tokens.add(current.toLowerCase());
        current = '';
      }
      continue;
    }
    if (current && current[current.length - 1] >= 'a' && current[current.length - 1] <= 'z') {
      if (char >= 'A' && char <= 'Z') {
        tokens.add(current.toLowerCase());
        current = char;
        continue;
      }
    }
    current += char;
  }
  if (current) {
    tokens.add(current.toLowerCase());
  }
  return tokens;
}

function hasAnyToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(value));
}

function routeRenderBreakType(): Break['type'] {
  return ['PAGE', 'RENDER', 'BROKEN'].join('_');
}

function pushRenderBreak(breaks: Break[], input: Omit<Break, 'type' | 'source' | 'surface'>): void {
  breaks.push({
    type: routeRenderBreakType(),
    ...input,
  });
}

function appRootCandidates(frontendDir: string): string[] {
  return [safeJoin(frontendDir, 'src', 'app'), safeJoin(frontendDir, 'app')].filter((candidate) =>
    pathExists(candidate),
  );
}

function routeFromPageFile(appRoot: string, filePath: string): string | null {
  const relativeDir = path.relative(appRoot, path.dirname(filePath));
  const routeSegments: string[] = [];

  for (const segment of relativeDir.split(path.sep)) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment.startsWith('(') && segment.endsWith(')')) {
      continue;
    }
    if (segment.includes('[') || segment.includes(']')) {
      return null;
    }
    routeSegments.push(segment);
  }

  return routeSegments.length === 0 ? '/' : `/${routeSegments.join('/')}`;
}

function discoverStaticPageRoutes(config: PulseConfig): string[] {
  const routes = new Set<string>();
  for (const appRoot of appRootCandidates(config.frontendDir)) {
    for (const file of walkFiles(appRoot, ['.tsx', '.ts'])) {
      const basename = path.basename(file);
      if (basename !== 'page.tsx' && basename !== 'page.ts') {
        continue;
      }
      const route = routeFromPageFile(appRoot, file);
      if (route) {
        routes.add(route);
      }
    }
  }
  return [...routes].sort();
}

function collectStringLiteralValues(node: ts.Node): string[] {
  const values: string[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
      values.push(child.text);
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return values;
}

function bindingNameForArrayLiteral(node: ts.ArrayLiteralExpression): string {
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent)) {
    return parent.name.getText();
  }
  return '';
}

function addPrefixEvidence(prefixes: Set<string>, values: string[]): void {
  for (const value of values) {
    if (value.startsWith('/') && !value.includes('[') && !value.includes(']')) {
      prefixes.add(value);
    }
  }
}

function discoverRoutePrefixEvidence(frontendDir: string): {
  publicPrefixes: Set<string>;
  protectedPrefixes: Set<string>;
} {
  const publicPrefixes = new Set<string>();
  const protectedPrefixes = new Set<string>();
  const libDir = safeJoin(frontendDir, 'src', 'lib');
  const candidateFiles = pathExists(libDir) ? walkFiles(libDir, ['.ts', '.tsx']) : [];

  for (const file of candidateFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (!ts.isArrayLiteralExpression(node)) {
        ts.forEachChild(node, visit);
        return;
      }
      const tokens = splitIdentifierTokens(bindingNameForArrayLiteral(node));
      const values = collectStringLiteralValues(node);
      if (hasAnyToken(tokens, ['auth', 'public', 'marketing', 'legal'])) {
        addPrefixEvidence(publicPrefixes, values);
      }
      if (hasAnyToken(tokens, ['app', 'protected', 'private'])) {
        addPrefixEvidence(protectedPrefixes, values);
      }
    };
    visit(sourceFile);
  }

  return { publicPrefixes, protectedPrefixes };
}

function routeMatchesPrefix(route: string, prefix: string): boolean {
  if (prefix === '/') {
    return route === '/';
  }
  return route === prefix || route.startsWith(`${prefix}/`);
}

function discoverRenderRoutes(config: PulseConfig): RenderRouteInventory {
  const pageRoutes = discoverStaticPageRoutes(config);
  const { publicPrefixes, protectedPrefixes } = discoverRoutePrefixEvidence(config.frontendDir);
  const publicRoutes: string[] = [];
  const protectedRoutes: string[] = [];

  for (const route of pageRoutes) {
    if ([...publicPrefixes].some((prefix) => routeMatchesPrefix(route, prefix))) {
      publicRoutes.push(route);
      continue;
    }
    if ([...protectedPrefixes].some((prefix) => routeMatchesPrefix(route, prefix))) {
      protectedRoutes.push(route);
    }
  }

  return {
    publicRoutes: [...new Set(publicRoutes)].sort(),
    protectedRoutes: [...new Set(protectedRoutes)].sort(),
  };
}

function bodyHasRuntimeErrorEvidence(body: string): boolean {
  const tokens = splitIdentifierTokens(body);
  const hasErrorToken = tokens.has('error') || tokens.has('errored');
  return (
    (hasErrorToken && hasAnyToken(tokens, ['exception', 'client', 'server', 'internal'])) ||
    (hasErrorToken && hasAnyToken(tokens, ['next', 'react', 'runtime'])) ||
    (hasAnyToken(tokens, ['hydration', 'hydrating']) && hasAnyToken(tokens, ['failed', 'error'])) ||
    (hasAnyToken(tokens, ['chunk', 'load']) && hasErrorToken)
  );
}

async function fetchPage(
  url: string,
  timeoutMs = 10000,
): Promise<{ status: number; body: string; timeMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual', // don't follow redirects — detect them explicitly
      headers: { Accept: 'text/html' },
    });
    const body = await res.text();
    return { status: res.status, body, timeMs: Date.now() - start };
  } catch {
    return { status: 0, body: '', timeMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/** Check ssr render. */
export async function checkSsrRender(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running frontend

  const breaks: Break[] = [];
  const baseFile = 'scripts/pulse/parsers/ssr-render-tester.ts';
  const frontendUrl = getFrontendUrl();
  const { publicRoutes, protectedRoutes } = discoverRenderRoutes(config);

  // ── Public pages: must return 200 with real HTML ──────────────────────────
  for (const page of publicRoutes) {
    const url = `${frontendUrl}${page}`;
    let result: { status: number; body: string; timeMs: number };
    try {
      result = await fetchPage(url);
    } catch {
      continue; // frontend not running
    }

    if (result.status === 0) {
      continue;
    } // network error — frontend not up

    if (result.status >= 500) {
      pushRenderBreak(breaks, {
        severity: 'critical',
        file: baseFile,
        line: 0,
        description: `Public page ${page} returned HTTP ${result.status}`,
        detail: `URL: ${url}. Response time: ${result.timeMs}ms. Body excerpt: ${result.body.slice(0, 300)}`,
      });
      continue;
    }

    if (result.status === 200) {
      // Must contain HTML tags
      if (!result.body.includes('<html') && !result.body.includes('<!DOCTYPE')) {
        pushRenderBreak(breaks, {
          severity: 'critical',
          file: baseFile,
          line: 0,
          description: `Public page ${page} returned 200 but body is not HTML`,
          detail: `URL: ${url}. Body size: ${result.body.length} bytes. Excerpt: ${result.body.slice(0, 200)}`,
        });
        continue;
      }

      // Must not be an empty shell
      if (result.body.length < 1000) {
        pushRenderBreak(breaks, {
          severity: 'critical',
          file: baseFile,
          line: 0,
          description: `Public page ${page} rendered only ${result.body.length} bytes (suspiciously small)`,
          detail: `URL: ${url}. A real page should be > 1000 bytes.`,
        });
        continue;
      }

      if (bodyHasRuntimeErrorEvidence(result.body)) {
        pushRenderBreak(breaks, {
          severity: 'critical',
          file: baseFile,
          line: 0,
          description: `Public page ${page} contains runtime error evidence`,
          detail: `URL: ${url}. The page rendered but included runtime error language.`,
        });
      }
    }
  }

  // ── Protected pages: must redirect (3xx), NOT crash (5xx) ─────────────────
  for (const page of protectedRoutes) {
    const url = `${frontendUrl}${page}`;
    let result: { status: number; body: string; timeMs: number };
    try {
      result = await fetchPage(url);
    } catch {
      continue;
    }
    if (result.status === 0) {
      continue;
    }

    if (result.status >= 500) {
      pushRenderBreak(breaks, {
        severity: 'critical',
        file: baseFile,
        line: 0,
        description: `Protected page ${page} returned HTTP ${result.status} (expected 3xx redirect)`,
        detail: `URL: ${url}. Auth middleware crashed instead of redirecting to /login. Body: ${result.body.slice(0, 200)}`,
      });
    }
  }

  return breaks;
}
