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
import * as ts from 'typescript';
import type {
  CrawlerRole,
  UICrawlerEvidence,
  UICrawlerStatus,
  UIDiscoveredElement,
  UIDiscoveredPage,
  UIElementKind,
  UIElementRisk,
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

const NAVIGATION_PATTERNS = [
  /\brouter\s*\.\s*push\s*\(/,
  /\brouter\s*\.\s*replace\s*\(/,
  /\bnavigate\s*\(/,
  /\bwindow\s*\.\s*location\s*\.\s*href\s*=/,
  /\bredirect\s*\(/,
];

const AUTH_BOUNDARY_RE =
  /\b(?:middleware|guard|withAuth|requireAuth|useAuth|useSession|getServerSession|authOptions|canActivate|requireSession|requireUser|protectedRoute)\b/i;

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

function endpointFromLiteralText(value: string): string | null {
  return value.startsWith('/') ? value : null;
}

function endpointFromTemplateExpression(node: ts.TemplateExpression): string | null {
  const templateParts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];

  for (const part of templateParts) {
    if (part.startsWith('/')) {
      return part;
    }
  }

  return null;
}

function endpointFromExpression(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return endpointFromLiteralText(node.text);
  }

  if (ts.isTemplateExpression(node)) {
    return endpointFromTemplateExpression(node);
  }

  return null;
}

/**
 * Extract API endpoint URLs from TS/TSX syntax.
 *
 * This is a syntactic discovery pass: it records literal URL-shaped first
 * arguments from call expressions, but it does not make final product, route,
 * or risk decisions. Those decisions stay downstream and must use observed
 * evidence.
 */
function extractApiEndpoints(text: string): string[] {
  const endpoints: string[] = [];
  const sourceFile = ts.createSourceFile(
    'pulse-ui-crawler-snippet.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const firstArg = node.arguments[0];
      const endpoint = firstArg ? endpointFromExpression(firstArg) : null;
      if (endpoint) {
        endpoints.push(endpoint);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return Array.from(new Set(endpoints));
}

function isExplicitFakeSignal(sourceLine: string, handlerName: string | null): boolean {
  const status = extractAttributeValue(sourceLine, 'data-pulse-status')?.toLowerCase();
  if (status === 'fake') return true;
  if (status === 'mock') return true;
  if (status === 'stub') return true;

  const handlerStatus = handlerName?.trim().toLowerCase();
  if (handlerStatus === 'fake') return true;
  if (handlerStatus === 'mock') return true;
  if (handlerStatus === 'stub') return true;

  return false;
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
// Risk classification
// ---------------------------------------------------------------------------

interface ElementRiskEvidence {
  kind: UIElementKind;
  sourceLine: string;
  handlerName: string | null;
  apiEndpoint: string | null;
  authRequired: boolean;
}

function extractAttributeValue(line: string, attributeName: string): string | null {
  const quoted = new RegExp(`${attributeName}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`).exec(line);
  if (quoted) return quoted[1];

  const braced = new RegExp(`${attributeName}\\s*=\\s*\\{\\s*["'\`]([^"'\`]+)["'\`]\\s*\\}`).exec(
    line,
  );
  return braced ? braced[1] : null;
}

function riskFromDomAttribute(line: string): UIElementRisk | null {
  for (const attrName of ['data-risk', 'data-pulse-risk', 'risk']) {
    const value = extractAttributeValue(line, attrName)?.toLowerCase();
    if (value === 'critical') return 'critical';
    if (value === 'high') return 'high';
    if (value === 'medium') return 'medium';
    if (value === 'low') return 'low';
  }
  return null;
}

function extractHttpMethodSignal(text: string): string | null {
  const attrMethod = extractAttributeValue(text, 'method');
  if (attrMethod) return attrMethod.toUpperCase();

  const propertyMethod = /\bmethod\s*:\s*["'`]([A-Za-z]+)["'`]/.exec(text);
  return propertyMethod ? propertyMethod[1].toUpperCase() : null;
}

function isMutatingHttpMethod(method: string | null): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function hasDirectMutationSignal(evidence: ElementRiskEvidence): boolean {
  const method = extractHttpMethodSignal(`${evidence.sourceLine}\n${evidence.handlerName ?? ''}`);
  if (isMutatingHttpMethod(method)) return true;
  if (evidence.kind === 'form' && method !== 'GET') return true;
  if (evidence.apiEndpoint && evidence.kind !== 'link' && evidence.kind !== 'nav') return true;
  return Boolean(evidence.handlerName && !isNavigationHandler(evidence.handlerName));
}

/**
 * Classify a UI element's risk level from observed element evidence.
 *
 * Product/domain words in routes or labels are raw signals only; they do not
 * decide risk here. A higher risk needs DOM/source evidence such as an explicit
 * risk attribute, mutating HTTP method, API endpoint, handler, form submission,
 * or authenticated interactive control.
 */
function classifyElementRisk(evidence: ElementRiskEvidence): UIElementRisk {
  const explicitRisk = riskFromDomAttribute(evidence.sourceLine);
  if (explicitRisk) return explicitRisk;

  const riskLabels = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.ui-crawler.ts',
    'UIElementRisk',
  );
  const kindLabels = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.ui-crawler.ts',
    'UIElementKind',
  );
  const authSensitiveKinds = new Set(['button', 'form', 'input', 'select', 'toggle']);
  const safeKinds = new Set(['link', 'nav', 'input', 'select']);

  if (hasDirectMutationSignal(evidence)) return 'high' as UIElementRisk;
  if (evidence.authRequired && authSensitiveKinds.has(evidence.kind))
    return 'high' as UIElementRisk;
  if (safeKinds.has(evidence.kind)) return 'low' as UIElementRisk;
  return 'medium' as UIElementRisk;
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

function parseNextRouteGroups(relFromApp: string): string[] {
  return relFromApp.split(path.sep).flatMap((segment) => {
    const trimmed = segment.trim();
    if (trimmed.length > 2 && trimmed.startsWith('(') && trimmed.endsWith(')')) {
      return [trimmed.slice(1, -1).toLowerCase()];
    }
    return [];
  });
}

function routeTokenFromAppSegment(segment: string): string | null {
  if (segment === '.' || segment === '') {
    return null;
  }
  if (segment.startsWith('(') && segment.endsWith(')')) {
    return null;
  }
  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return `:${segment.slice(5, -2)}`;
  }
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return `:${segment.slice(4, -1)}`;
  }
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return `:${segment.slice(1, -1)}`;
  }
  return segment;
}

function routeFromAppDir(dir: string): string {
  const tokens = dir.split(path.sep).flatMap((segment) => {
    const token = routeTokenFromAppSegment(segment);
    return token ? [token] : [];
  });

  if (tokens.length === 0) {
    return '/';
  }

  return `/${tokens.join('/')}`;
}

/**
 * Determine if a page file or its route group requires authentication.
 * Checks for middleware imports, auth guards, and route group prefixes.
 */
function detectAuthRequired(filePath: string, relFromApp: string, content: string): boolean {
  if (AUTH_BOUNDARY_RE.test(content)) return true;

  const routeGroups = parseNextRouteGroups(relFromApp);
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
function resolveComponentFiles(
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

// ---------------------------------------------------------------------------
// Element parsing
// ---------------------------------------------------------------------------

/**
 * Parse a JSX/TSX file to discover all interactive elements and their handlers.
 *
 * Uses regex-based extraction to find buttons, links, forms, inputs, selects,
 * modals, menus, tabs, and toggles (including shadcn/ui components). For each
 * element, extracts handler names, labels, risk level, and any API endpoints
 * called inline.
 *
 * @param filePath - Absolute path to the JSX/TSX file.
 * @param pageUrl  - The page URL for risk classification context.
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

  const byRole = Object.fromEntries(
    [
      ...deriveStringUnionMembersFromTypeContract(
        'scripts/pulse/types.ui-crawler.ts',
        'CrawlerRole',
      ),
    ].map((role) => [role, { pages: deriveZeroValue(), elements: deriveZeroValue() }]),
  ) as Record<CrawlerRole, { pages: number; elements: number }>;

  const deadHandlers: UICrawlerEvidence['deadHandlers'] = [];
  const formSubmissions: UICrawlerEvidence['formSubmissions'] = [];
  let totalElements = deriveZeroValue();
  let actionableElements = deriveZeroValue();
  let workingElements = deriveZeroValue();
  let brokenElements = deriveZeroValue();
  let fakeElements = deriveZeroValue();

  const frontendDir = safeJoin(rootDir, FRONTEND_SRC);
  const appDir = safeJoin(frontendDir, APP_DIR);

  for (const page of pages) {
    byRole[page.role].pages += 1;

    const pageFilePath =
      page.url === '/' ? safeJoin(appDir, '(public)', 'page.tsx') : findPageFile(appDir, page.url);

    if (pageFilePath && pathExists(pageFilePath)) {
      const componentFiles = resolveComponentFiles(pageFilePath, rootDir);
      const allElementFiles = [pageFilePath, ...componentFiles];
      const allElements: UIDiscoveredElement[] = [];

      for (const filePath of allElementFiles) {
        const fileElements = parseElementsFromFile(filePath, page.url, page.authRequired);
        allElements.push(...fileElements);
      }

      for (const element of allElements) {
        const elementFile = element.linkedFilePath || pageFilePath;
        const { handlerFile, apiEndpoint } = mapElementToHandler(element, elementFile, rootDir);

        element.linkedEndpoint = apiEndpoint || element.linkedEndpoint;
        element.linkedFilePath = handlerFile;

        const classification = classifyHandlerStatus(element, apiEndpoint);
        element.status = classification.status;
        if (classification.reason) element.errorMessage = classification.reason;
      }

      page.elements = allElements;

      byRole[page.role].elements += allElements.length;
      totalElements += allElements.length;

      for (const element of allElements) {
        if (element.actionable) actionableElements++;
        const brokenStatuses = deriveBrokenStatuses();
        if (element.status === ('works' as UICrawlerStatus)) workingElements++;
        if (brokenStatuses.has(element.status)) brokenElements++;
        const deadStatuses = deriveDeadHandlerStatuses();
        const criticalRoles = deriveCriticalRoles();
        if (element.status === ('fake' as UICrawlerStatus)) fakeElements++;

        if (deadStatuses.has(element.status) && element.handlerAttached) {
          deadHandlers.push({
            selector: element.selector,
            page: page.url,
            role: page.role,
            reason: element.errorMessage || 'Handler with no valid API endpoint',
            critical: criticalRoles.has(page.role),
          });
        }

        if (element.kind === ('form' as UIElementKind) && element.handlerAttached) {
          formSubmissions.push({
            formSelector: element.selector,
            page: page.url,
            role: page.role,
            status: element.status,
            apiCalls: element.linkedEndpoint
              ? [
                  {
                    url: element.linkedEndpoint,
                    method: deriveHttpMethodPost(),
                    statusCode: null,
                    durationMs: deriveZeroValue(),
                    failed: element.status !== ('works' as UICrawlerStatus),
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
