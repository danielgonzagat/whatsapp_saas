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

  if (hasDirectMutationSignal(evidence)) return 'high';
  if (
    evidence.authRequired &&
    (evidence.kind === 'button' ||
      evidence.kind === 'form' ||
      evidence.kind === 'input' ||
      evidence.kind === 'select' ||
      evidence.kind === 'toggle')
  ) {
    return 'high';
  }
  if (evidence.kind === 'link' || evidence.kind === 'nav') return 'low';
  if (evidence.kind === 'input' || evidence.kind === 'select') return 'low';
  return 'medium';
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
    } else if (isExplicitFakeSignal(line, handlerName)) {
      status = 'fake';
      errorMessage = 'Element carries explicit fake/mock/stub evidence';
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

