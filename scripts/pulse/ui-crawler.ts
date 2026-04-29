/**
 * UI Interaction Crawler — catalog builder (discovery, not execution).
 *
 * Scans the frontend source tree to discover pages, interactive elements,
 * their event handlers, and the backend API endpoints they call. The result
 * is a {@link UICrawlerEvidence} artifact that Playwright-based execution
 * uses later to actually click through the app.
 *
 * @module ui-crawler
 */

import * as path from 'path';
import type {
  CrawlerRole,
  UICrawlerEvidence,
  UICrawlerStatus,
  UIDiscoveredElement,
  UIDiscoveredPage,
  UIElementKind,
  UINetworkCall,
} from './types.ui-crawler';
import { ensureDir, pathExists, readDir, readTextFile, writeTextFile } from './safe-fs';
import { safeJoin, safeResolve } from './safe-path';
import { walkFiles } from './parsers/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRONTEND_SRC = 'frontend/src';
const APP_DIR = 'app';

const DOM_ELEMENTS: Record<string, UIElementKind> = {
  button: 'button',
  a: 'link',
  form: 'form',
  input: 'input',
  select: 'select',
  textarea: 'input',
};

const SHADCN_ELEMENTS: Record<string, UIElementKind> = {
  Button: 'button',
  Link: 'link',
  Form: 'form',
  Input: 'input',
  Select: 'select',
  Textarea: 'input',
  Dialog: 'modal',
  Modal: 'modal',
  DropdownMenu: 'menu',
  NavigationMenu: 'nav',
  Tabs: 'tab',
  Toggle: 'toggle',
  Switch: 'toggle',
};

const DOM_HANDLER_PROPS = new Set([
  'onClick',
  'onSubmit',
  'onChange',
  'onBlur',
  'onFocus',
  'onInput',
  'onKeyDown',
  'onKeyUp',
  'onMouseDown',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseUp',
  'onPointerDown',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerUp',
]);

const API_CALL_PATTERNS = [
  /fetch\s*\(\s*(?:['"`](\/[^'"`]+)['"`]|`[^`]*\$\{[^}]*}(\/?[^`]*)`)/g,
  /apiFetch\s*(?:<[^>]*>)?\s*\(\s*(?:['"`](\/[^'"`]+)['"`]|`[^`]*\$\{[^}]*}(\/?[^`]*)`)/g,
  /axios(?:\.(?:get|post|put|patch|delete))?\s*\(\s*(?:['"`](\/[^'"`]+)['"`]|`[^`]*\$\{[^}]*}(\/?[^`]*)`)/g,
  /useSWR\s*(?:<[^>]*>)?\s*\(\s*(?:['"`](\/[^'"`]+)['"`]|`[^`]*\$\{[^}]*}(\/?[^`]*)`)/g,
  /useMutation\s*(?:<[^>]*>)?\s*\(\s*(?:['"`](\/[^'"`]+)['"`]|`[^`]*\$\{[^}]*}(\/?[^`]*)`)/g,
  /useQuery\s*(?:<[^>]*>)?\s*\(\s*(?:['"`](\/[^'"`]+)['"`]|`[^`]*\$\{[^}]*}(\/?[^`]*)`)/g,
];

const FAKE_API_PATTERNS = [/\/mock/i, /\/fake/i, /\/stub/i, /\/fixture/i, /\/dummy/i];

const NAVIGATION_PATTERNS = [
  /\brouter\s*\.\s*push\s*\(/,
  /\brouter\s*\.\s*replace\s*\(/,
  /\bnavigate\s*\(/,
  /\bwindow\s*\.\s*location\s*\.\s*href\s*=/,
  /\bredirect\s*\(/,
];

const AUTH_BOUNDARY_RE =
  /\b(?:middleware|guard|withAuth|requireAuth|useAuth|useSession|getServerSession|authOptions|canActivate|requireSession|requireUser|protectedRoute)\b/i;
const ROUTE_GROUP_RE = /\(([^)]+)\)/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isWhitespaceChar(c: string | undefined): boolean {
  if (!c) return false;
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}

function isIdentifierChar(c: string | undefined): boolean {
  return Boolean(c && /[\w$]/.test(c));
}

function hasIdentifierAt(text: string, offset: number, identifier: string): boolean {
  if (!text.startsWith(identifier, offset)) return false;
  return !isIdentifierChar(text[offset - 1]) && !isIdentifierChar(text[offset + identifier.length]);
}

/** Extract the handler expression from a JSX prop assignment like `onClick={handler}`. */
function extractJSXHandler(line: string, eventName: string): string | null {
  let searchFrom = 0;
  while (searchFrom < line.length) {
    const eventIndex = line.indexOf(eventName, searchFrom);
    if (eventIndex < 0) return null;

    let cursor = eventIndex + eventName.length;
    while (isWhitespaceChar(line[cursor])) cursor++;
    if (line[cursor] !== '=') {
      searchFrom = cursor;
      continue;
    }

    cursor++;
    while (isWhitespaceChar(line[cursor])) cursor++;
    if (line[cursor] !== '{') {
      searchFrom = cursor;
      continue;
    }

    const start = cursor + 1;
    let depth = 1;
    let i = start;

    while (i < line.length && depth > 0) {
      const ch = line[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        i++;
        while (i < line.length && line[i] !== quote) {
          if (line[i] === '\\') i++;
          i++;
        }
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) return line.substring(start, i).trim();
      }
      i++;
    }

    if (depth > 0 && start < line.length) {
      return line.substring(start).trim();
    }
    searchFrom = start;
  }
  return null;
}

/** Extract a visible label from a JSX line. */
function extractLabel(line: string, lines: string[], idx: number): string {
  const textMatch = line.match(/>([^<]{1,80})</);
  if (textMatch) return textMatch[1].trim();

  const labelMatch = line.match(/label\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (labelMatch) return labelMatch[1];

  const ariaMatch = line.match(/aria-label\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (ariaMatch) return ariaMatch[1];

  const titleMatch = line.match(/title\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (titleMatch) return titleMatch[1];

  const placeholderMatch = line.match(/placeholder\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (placeholderMatch) return placeholderMatch[1];

  for (let j = 1; j <= 3 && idx + j < lines.length; j++) {
    const nextLine = lines[idx + j].trim();
    if (
      /^(?:background|display|width|height|position|border|color|font|padding|margin|flex|align|justify|cursor|opacity|transform|transition|overflow|gap|aspect|grid|z-index|top|left|right|bottom)\s*[:=]/i.test(
        nextLine,
      )
    )
      continue;
    if (/^\.\.\.\w+/.test(nextLine)) continue;

    const nextText = nextLine.match(/^([^<{>\s][^<]{1,80})/);
    if (
      nextText &&
      !nextText[1].includes('=') &&
      !nextText[1].includes('{') &&
      !nextText[1].startsWith('//')
    )
      return nextText[1].trim();

    const insideTag = nextLine.match(/>([^<]{1,80})</);
    if (insideTag) return insideTag[1].trim();
  }

  return '(no label)';
}

/** Check if a JSX element has a `disabled` attribute. */
function isDisabled(line: string): boolean {
  return /\bdisabled\b/.test(line);
}

/** Determine element kind from a JSX line. */
function detectElementKind(line: string): UIElementKind | null {
  for (const [tag, kind] of Object.entries(DOM_ELEMENTS)) {
    const re = new RegExp(`<${tag}\\b`, 'i');
    if (re.test(line)) return kind;
  }
  for (const [tag, kind] of Object.entries(SHADCN_ELEMENTS)) {
    const re = new RegExp(`<${tag}\\b`);
    if (re.test(line)) return kind;
  }
  return null;
}

/** Extract href from a link element. */
function extractHref(line: string): string | null {
  const match = line.match(/href\s*=\s*["'`]([^"'`]+)["'`]/);
  return match ? match[1] : null;
}

/** Extract the action URL from a form element. */
function extractFormAction(line: string): string | null {
  const match = line.match(/action\s*=\s*["'`]([^"'`]+)["'`]/);
  return match ? match[1] : null;
}

/** Extract API endpoint URLs from text content. */
function extractApiEndpoints(text: string): string[] {
  const endpoints: string[] = [];
  for (const pattern of API_CALL_PATTERNS) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const raw = m[1] || m[2];
      if (raw && raw.startsWith('/')) {
        endpoints.push(raw);
      }
    }
  }
  return Array.from(new Set(endpoints));
}

/** Check if an endpoint appears to be a mock/fake. */
function isFakeEndpoint(endpoint: string): boolean {
  return FAKE_API_PATTERNS.some((re) => re.test(endpoint));
}

/** Check if a handler expression is purely a navigation call. */
function isNavigationHandler(handler: string): boolean {
  return NAVIGATION_PATTERNS.some((re) => re.test(handler));
}

/** Build a CSS selector-like string for an element. */
function buildSelector(
  kind: UIElementKind,
  label: string,
  handlerName: string | null,
  idx: number,
): string {
  if (handlerName) return `${kind}[data-handler="${handlerName}"]`;
  if (label && label !== '(no label)') return `${kind}[aria-label="${label}"]`;
  return `${kind}:nth-of-type(${idx + 1})`;
}

// ---------------------------------------------------------------------------
// Route → Role classification
// ---------------------------------------------------------------------------

const ROLE_NAMES = new Set<CrawlerRole>([
  'anonymous',
  'customer',
  'operator',
  'admin',
  'producer',
  'affiliate',
]);

/**
 * Classify a URL route into a {@link CrawlerRole}.
 *
 * @param url - The URL route path (e.g. `/admin/users`, `/vendas/pipeline`).
 * @returns The inferred crawler role.
 */
export function classifyRoleFromRoute(url: string): CrawlerRole {
  if (url === '/') return 'anonymous';
  const [firstSegment] = url
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  if (firstSegment && ROLE_NAMES.has(firstSegment as CrawlerRole)) {
    return firstSegment as CrawlerRole;
  }

  return 'customer';
}

// ---------------------------------------------------------------------------
// Auth detection
// ---------------------------------------------------------------------------

/**
 * Determine if a page file or its route group requires authentication.
 * Checks for middleware imports, auth guards, and route group prefixes.
 */
function detectAuthRequired(filePath: string, relFromApp: string, content: string): boolean {
  if (AUTH_BOUNDARY_RE.test(content)) return true;

  const routeGroups = Array.from(relFromApp.matchAll(ROUTE_GROUP_RE)).map((match) =>
    match[1]?.toLowerCase(),
  );
  if (routeGroups.some((group) => group && AUTH_BOUNDARY_RE.test(group))) return true;

  const normalizedPath = filePath.toLowerCase();
  if (/(?:^|[/.:-])(?:middleware|guard|protected-route)(?:[/.:-]|$)/i.test(normalizedPath))
    return true;

  return false;
}

// ---------------------------------------------------------------------------
// Page discovery
// ---------------------------------------------------------------------------

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

    let route =
      '/' +
      dir
        .replace(/\([^)]+\)\/?/g, '')
        .replace(/\[\.\.\.(\w+)\]/g, ':$1')
        .replace(/\[(\w+)\]/g, ':$1')
        .replace(/\/+/g, '/')
        .replace(/\/$/, '');

    if (route === '/.' || route === '') route = '/';

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

// ---------------------------------------------------------------------------
// Element parsing
// ---------------------------------------------------------------------------

/**
 * Parse a JSX/TSX file to discover all interactive elements and their handlers.
 *
 * Uses regex-based extraction to find buttons, links, forms, inputs, selects,
 * modals, menus, tabs, and toggles (including shadcn/ui components). For each
 * element, extracts handler names, labels, and any API endpoints called inline.
 *
 * @param filePath - Absolute path to the JSX/TSX file.
 * @returns Array of discovered elements found in the file.
 */
export function parseElementsFromFile(filePath: string): UIDiscoveredElement[] {
  let content: string;
  try {
    content = readTextFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const elements: UIDiscoveredElement[] = [];

  const kindCounters: Record<UIElementKind, number> = {
    button: 0,
    link: 0,
    form: 0,
    input: 0,
    select: 0,
    modal: 0,
    menu: 0,
    nav: 0,
    tab: 0,
    toggle: 0,
  };

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

    if (!handlerName && kind !== 'input' && kind !== 'select') {
      status = 'no_handler';
    } else if (apiEndpoint && isFakeEndpoint(apiEndpoint)) {
      status = 'fake';
      errorMessage = `Endpoint ${apiEndpoint} appears to be a mock/stub`;
    } else if (handlerName && isNavigationHandler(handlerName)) {
      status = 'works';
    } else if (handlerName || apiEndpoint) {
      status = 'works';
    } else {
      status = 'no_handler';
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
    });
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Handler → API mapping
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Dead handler detection
// ---------------------------------------------------------------------------

/**
 * Determine whether a handler appears to be dead (no-op, fake, or missing).
 */
function classifyHandlerStatus(
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
  if (apiEndpoint && isFakeEndpoint(apiEndpoint)) {
    return { status: 'fake', reason: `Calls fake endpoint: ${apiEndpoint}` };
  }
  return { status: 'works', reason: null };
}

// ---------------------------------------------------------------------------
// Catalog builder — main entry point
// ---------------------------------------------------------------------------

/**
 * Build the full UI Crawler catalog for a repository.
 *
 * Discovers all pages in the Next.js App Router, parses their interactive
 * elements, maps each element's handler to an API endpoint (by tracing
 * imports and function definitions), detects dead/fake handlers, and
 * classifies every page by role.
 *
 * The result is written to `.pulse/current/PULSE_CRAWLER_EVIDENCE.json`.
 *
 * @param rootDir - Repository root directory.
 * @returns The full {@link UICrawlerEvidence} artifact.
 */
export function buildUICrawlerCatalog(rootDir: string): UICrawlerEvidence {
  const pages = discoverPages(rootDir);

  const byRole: Record<CrawlerRole, { pages: number; elements: number }> = {
    anonymous: { pages: 0, elements: 0 },
    customer: { pages: 0, elements: 0 },
    operator: { pages: 0, elements: 0 },
    admin: { pages: 0, elements: 0 },
    producer: { pages: 0, elements: 0 },
    affiliate: { pages: 0, elements: 0 },
  };

  const deadHandlers: UICrawlerEvidence['deadHandlers'] = [];
  const formSubmissions: UICrawlerEvidence['formSubmissions'] = [];
  let totalElements = 0;
  let actionableElements = 0;
  let workingElements = 0;
  let brokenElements = 0;
  let fakeElements = 0;

  const frontendDir = safeJoin(rootDir, FRONTEND_SRC);
  const appDir = safeJoin(frontendDir, APP_DIR);

  for (const page of pages) {
    byRole[page.role].pages += 1;

    const pageFilePath =
      page.url === '/' ? safeJoin(appDir, '(public)', 'page.tsx') : findPageFile(appDir, page.url);

    if (pageFilePath && pathExists(pageFilePath)) {
      page.elements = parseElementsFromFile(pageFilePath);

      for (const element of page.elements) {
        const { handlerFile, apiEndpoint } = mapElementToHandler(element, pageFilePath, rootDir);

        element.linkedEndpoint = apiEndpoint || element.linkedEndpoint;
        element.linkedFilePath = handlerFile;

        const classification = classifyHandlerStatus(element, apiEndpoint);
        element.status = classification.status;
        if (classification.reason) element.errorMessage = classification.reason;
      }

      byRole[page.role].elements += page.elements.length;
      totalElements += page.elements.length;

      for (const element of page.elements) {
        if (element.actionable) actionableElements++;
        if (element.status === 'works') workingElements++;
        if (
          element.status === 'error' ||
          element.status === 'no_handler' ||
          element.status === 'blocked' ||
          element.status === 'not_reached' ||
          element.status === 'not_executable'
        )
          brokenElements++;
        if (element.status === 'fake') fakeElements++;

        if (
          (element.status === 'no_handler' ||
            element.status === 'fake' ||
            element.status === 'error') &&
          element.handlerAttached
        ) {
          deadHandlers.push({
            selector: element.selector,
            page: page.url,
            role: page.role,
            reason: element.errorMessage || 'Handler with no valid API endpoint',
            critical: page.role === 'admin' || page.role === 'operator',
          });
        }

        if (element.kind === 'form' && element.handlerAttached) {
          formSubmissions.push({
            formSelector: element.selector,
            page: page.url,
            role: page.role,
            status: element.status,
            apiCalls: element.linkedEndpoint
              ? [
                  {
                    url: element.linkedEndpoint,
                    method: 'POST',
                    statusCode: null,
                    durationMs: 0,
                    failed: element.status !== 'works',
                    errorMessage: element.errorMessage,
                  },
                ]
              : [],
          });
        }
      }
    }
  }

  const evidence: UICrawlerEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPages: pages.length,
      reachablePages: pages.filter((p) => p.reachable).length,
      totalElements,
      actionableElements,
      workingElements,
      brokenElements,
      fakeElements,
      byRole,
    },
    pages,
    deadHandlers,
    formSubmissions,
  };

  const outputDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outputDir, { recursive: true });
  writeTextFile(
    safeJoin(outputDir, 'PULSE_CRAWLER_EVIDENCE.json'),
    JSON.stringify(evidence, null, 2),
  );

  return evidence;
}

/** Find the page.tsx file for a given route in the App Router. */
function findPageFile(appDir: string, url: string): string | null {
  const normalizedUrl = url === '/' ? '' : url.replace(/^\//, '');
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

function discoverRouteGroups(appDir: string): string[] {
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
