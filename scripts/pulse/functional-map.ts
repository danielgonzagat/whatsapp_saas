// PULSE — Functional Map Builder
// Traces every page → every interactive element → handler → API → backend → service → Prisma
// Classifies each interaction: FUNCIONA | FACHADA | QUEBRADO | INCOMPLETO | AUSENTE

import * as fs from 'fs';
import * as path from 'path';
import type { PulseConfig, UIElement, APICall, BackendRoute, ServiceTrace, ProxyRoute, FacadeEntry } from './types';
import type { HookRegistry } from './parsers/hook-registry';
import type {
  InteractionStatus, InteractionChain, DataSource,
  PageFunctionalMap, FunctionalMapResult, PageEntry, CoreParserData,
} from './functional-map-types';
import {
  normalizeForMatch, buildRouteLookup, matchApiCallToRoute,
  buildServiceModelMap, resolveRouteModels,
  type RouteKey,
} from './graph';
import { buildApiModuleMap } from './parsers/api-parser';
import { walkFiles } from './parsers/utils';

// ===== Step 1: Discover all pages =====

export function findAllPages(config: PulseConfig): PageEntry[] {
  const appDir = path.join(config.frontendDir, 'app');
  if (!fs.existsSync(appDir)) return [];

  const pageFiles = walkFiles(appDir, ['.tsx']).filter(f => f.endsWith('/page.tsx'));
  const pages: PageEntry[] = [];

  for (const absFile of pageFiles) {
    const relFile = path.relative(config.rootDir, absFile);
    const relFromApp = path.relative(appDir, absFile);

    // Derive route from directory structure
    const dir = path.dirname(relFromApp);
    let route = '/' + dir
      .replace(/\(main\)\/?/g, '')
      .replace(/\(public\)\/?/g, '')
      .replace(/\(checkout\)\/?/g, '')
      .replace(/\(auth\)\/?/g, '')
      .replace(/\[\.\.\.(\w+)\]/g, ':$1')
      .replace(/\[(\w+)\]/g, ':$1')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');

    if (route === '/.' || route === '/') route = '/';

    // Detect route group
    let group = 'other';
    if (relFromApp.startsWith('(main)')) group = 'main';
    else if (relFromApp.startsWith('(public)')) group = 'public';
    else if (relFromApp.startsWith('(checkout)')) group = 'checkout';
    else if (relFromApp.startsWith('e2e')) group = 'e2e';
    else if (relFromApp.startsWith('api/') || relFromApp.startsWith('auth/')) group = 'api';

    // Detect redirect pages
    let isRedirect = false;
    let redirectTarget: string | null = null;
    try {
      const content = fs.readFileSync(absFile, 'utf8');
      const redirectMatch = content.match(/redirect\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
      if (redirectMatch && /import.*redirect/.test(content)) {
        isRedirect = true;
        redirectTarget = redirectMatch[1];
      }
    } catch { /* skip */ }

    // Skip API route handlers (they're not pages)
    if (group === 'api') continue;

    pages.push({ pageFile: absFile, relFile, route, group, isRedirect, redirectTarget });
  }

  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

// ===== Step 2: Resolve component tree per page =====

function resolveImportPath(importPath: string, frontendDir: string): string | null {
  let resolved: string;

  if (importPath.startsWith('@/')) {
    resolved = path.join(frontendDir, importPath.slice(2));
  } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
    return null; // relative imports handled differently
  } else {
    return null; // external package
  }

  // Try extensions
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const candidate = resolved + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  // Already has extension
  if (fs.existsSync(resolved)) return resolved;

  return null;
}

export function resolveComponentTree(
  pageFile: string,
  frontendDir: string,
  maxDepth: number = 3,
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function walk(file: string, depth: number) {
    if (depth > maxDepth || visited.has(file)) return;
    if (!fs.existsSync(file)) return;
    visited.add(file);
    result.push(file);

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch { return; }

    // Static imports: import X from '@/components/...'
    const staticImportRe = /import\s+(?:\w+|\{[^}]+\})\s+from\s+['"](@\/(?:components|hooks|lib)\/[^'"]+)['"]/g;
    let m;
    while ((m = staticImportRe.exec(content)) !== null) {
      const resolved = resolveImportPath(m[1], frontendDir);
      if (resolved) walk(resolved, depth + 1);
    }

    // Dynamic imports: dynamic(() => import('@/components/...'))
    const dynamicImportRe = /import\s*\(\s*['"](@\/(?:components|hooks|lib)\/[^'"]+)['"]\s*\)/g;
    while ((m = dynamicImportRe.exec(content)) !== null) {
      const resolved = resolveImportPath(m[1], frontendDir);
      if (resolved) walk(resolved, depth + 1);
    }

    // Relative imports within component files
    const relativeImportRe = /import\s+(?:\w+|\{[^}]+\})\s+from\s+['"](\.\/.+?|\.\.\/.*?)['"]/g;
    while ((m = relativeImportRe.exec(content)) !== null) {
      const importPath = m[1];
      const dir = path.dirname(file);
      const candidate = path.resolve(dir, importPath);
      for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts', '']) {
        const full = candidate + ext;
        if (fs.existsSync(full) && !visited.has(full)) {
          walk(full, depth + 1);
          break;
        }
      }
    }
  }

  walk(pageFile, 0);
  return result;
}

// ===== Step 3: Group UI elements by page =====

function groupElementsByPage(
  pages: PageEntry[],
  pageComponentTrees: Map<string, string[]>,
  uiElements: UIElement[],
  rootDir: string,
): Map<string, UIElement[]> {
  // Build reverse lookup: relative file path → set of page routes
  const fileToPages = new Map<string, Set<string>>();
  for (const page of pages) {
    const tree = pageComponentTrees.get(page.route) || [];
    for (const absFile of tree) {
      const relFile = path.relative(rootDir, absFile);
      if (!fileToPages.has(relFile)) fileToPages.set(relFile, new Set());
      fileToPages.get(relFile)!.add(page.route);
    }
  }

  // Group elements by page
  const result = new Map<string, UIElement[]>();
  for (const page of pages) {
    result.set(page.route, []);
  }

  for (const el of uiElements) {
    const pageRoutes = fileToPages.get(el.file);
    if (pageRoutes) {
      for (const route of pageRoutes) {
        result.get(route)!.push(el);
      }
    }
  }

  return result;
}

// ===== Step 4: Trace interaction chain =====

function findApiCallForEndpoint(
  endpoint: string,
  apiCalls: APICall[],
): APICall | null {
  // Direct match
  for (const call of apiCalls) {
    if (call.endpoint === endpoint || call.normalizedPath === endpoint) {
      return call;
    }
  }
  // Fuzzy match (param segments)
  const norm = normalizeForMatch(endpoint);
  for (const call of apiCalls) {
    if (normalizeForMatch(call.normalizedPath) === norm) {
      return call;
    }
  }
  return null;
}

function findApiCallForElement(
  element: UIElement,
  apiCalls: APICall[],
  hookRegistry: HookRegistry,
  apiModuleMap: Map<string, { endpoint: string; method: string }>,
  fileContent: string,
): { endpoint: string; method: string; file: string; line: number } | null {
  // 1. Element has direct apiCalls from the UI parser
  if (element.apiCalls.length > 0) {
    for (const ep of element.apiCalls) {
      const call = findApiCallForEndpoint(ep, apiCalls);
      if (call) {
        return { endpoint: call.normalizedPath, method: call.method, file: call.file, line: call.line };
      }
      // Even without match in apiCalls array, the endpoint itself is useful
      return { endpoint: ep, method: 'POST', file: element.file, line: element.line };
    }
  }

  // 2. Handler calls a hook-provided function
  if (element.handler) {
    const handler = element.handler;

    // Check hook registry for the function name
    for (const [hookName, funcMap] of hookRegistry) {
      for (const [funcName, hookFunc] of funcMap) {
        if (handler.includes(funcName)) {
          return {
            endpoint: hookFunc.endpoint,
            method: hookFunc.method,
            file: element.file,
            line: element.line,
          };
        }
      }
    }

    // Check API module map
    for (const [funcName, { endpoint, method }] of apiModuleMap) {
      if (handler.includes(funcName)) {
        return { endpoint, method, file: element.file, line: element.line };
      }
    }

    // 3. Try to find apiFetch calls in handler's function body
    if (fileContent) {
      const funcNameMatch = handler.match(/^(\w+)$/);
      if (funcNameMatch) {
        const funcName = funcNameMatch[1];
        const funcDefRe = new RegExp(`(?:const|let|function|async function)\\s+${funcName}\\s*(?:=|\\()`, 'g');
        const defMatch = funcDefRe.exec(fileContent);
        if (defMatch) {
          const defIdx = fileContent.substring(0, defMatch.index).split('\n').length - 1;
          const lines = fileContent.split('\n');
          const bodyText = lines.slice(defIdx, Math.min(defIdx + 40, lines.length)).join('\n');

          const apiMatch = bodyText.match(/apiFetch\s*(?:<[^>]*>)?\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/);
          if (apiMatch) {
            let ep = apiMatch[1] || apiMatch[2];
            // Normalize template literals
            ep = ep.replace(/\$\{[^}]+\}/g, ':param');
            return { endpoint: ep, method: detectMethodFromBody(bodyText), file: element.file, line: element.line };
          }

          // Check for hook-provided function calls in body
          for (const [hookName, funcMap] of hookRegistry) {
            for (const [fname, hookFunc] of funcMap) {
              if (new RegExp(`\\b${fname}\\s*\\(`).test(bodyText)) {
                return {
                  endpoint: hookFunc.endpoint,
                  method: hookFunc.method,
                  file: element.file,
                  line: element.line,
                };
              }
            }
          }

          // Check for API module calls in body
          for (const [fname, { endpoint, method }] of apiModuleMap) {
            if (new RegExp(`\\b${fname}\\s*[.(]`).test(bodyText)) {
              return { endpoint, method, file: element.file, line: element.line };
            }
          }
        }
      }
    }
  }

  return null;
}

function detectMethodFromBody(body: string): string {
  const m = body.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
  if (m) return m[1].toUpperCase();
  if (/\.post\s*\(/i.test(body)) return 'POST';
  if (/\.put\s*\(/i.test(body)) return 'PUT';
  if (/\.patch\s*\(/i.test(body)) return 'PATCH';
  if (/\.delete\s*\(/i.test(body)) return 'DELETE';
  return 'POST';
}

function traceInteractionChain(
  element: UIElement,
  page: PageEntry,
  apiCalls: APICall[],
  routeLookup: Map<RouteKey, BackendRoute>,
  proxyRoutes: ProxyRoute[],
  serviceModelMap: Map<string, string[]>,
  serviceTraces: ServiceTrace[],
  hookRegistry: HookRegistry,
  apiModuleMap: Map<string, { endpoint: string; method: string }>,
  fileContentCache: Map<string, string>,
): InteractionChain {
  const chain: InteractionChain = {
    pageRoute: page.route,
    pageFile: page.relFile,
    componentFile: element.file,
    elementType: element.type,
    elementLabel: element.label,
    elementLine: element.line,
    handler: element.handler,
    handlerType: element.handlerType,
    apiCall: null,
    proxyRoute: null,
    backendRoute: null,
    serviceMethod: null,
    prismaModels: [],
    status: 'AUSENTE',
    statusReason: '',
    facadeEvidence: [],
  };

  // Skip navigation-only elements
  if (element.handlerType === 'navigation') {
    chain.status = 'FUNCIONA';
    chain.statusReason = 'Navigation handler (router.push/link)';
    return chain;
  }

  // AUSENTE: no handler or noop
  if (!element.handler || element.handlerType === 'noop') {
    chain.status = 'AUSENTE';
    chain.statusReason = element.handlerType === 'noop' ? 'Noop handler (empty function)' : 'No handler attached';
    return chain;
  }

  if (element.handlerType === 'dead') {
    chain.status = 'AUSENTE';
    chain.statusReason = 'Dead handler (function exists but does nothing useful)';
    return chain;
  }

  // Get file content for deeper analysis
  const absFile = path.join(
    fileContentCache.has(element.file) ? '' : '',
    // element.file is relative, we need to read it
  );
  const fileContent = fileContentCache.get(element.file) || '';

  // Try to find the API call
  const apiCallInfo = findApiCallForElement(element, apiCalls, hookRegistry, apiModuleMap, fileContent);

  if (apiCallInfo) {
    chain.apiCall = apiCallInfo;

    // Check if it goes through a proxy route
    const proxy = proxyRoutes.find(p =>
      normalizeForMatch(p.frontendPath) === normalizeForMatch(apiCallInfo.endpoint)
    );
    if (proxy) {
      chain.proxyRoute = { frontendPath: proxy.frontendPath, backendPath: proxy.backendPath };
    }

    // Match to backend route
    const mockApiCall: APICall = {
      file: apiCallInfo.file,
      line: apiCallInfo.line,
      endpoint: apiCallInfo.endpoint,
      normalizedPath: apiCallInfo.endpoint,
      method: apiCallInfo.method,
      callPattern: 'apiFetch',
      isProxy: !!proxy,
      proxyTarget: proxy?.backendPath || null,
      callerFunction: null,
    };

    const backendRoute = matchApiCallToRoute(mockApiCall, routeLookup, proxyRoutes);
    if (backendRoute) {
      chain.backendRoute = {
        fullPath: backendRoute.fullPath,
        httpMethod: backendRoute.httpMethod,
        methodName: backendRoute.methodName,
        file: backendRoute.file,
        guards: backendRoute.guards,
      };

      // Resolve service methods
      for (const svcCall of backendRoute.serviceCalls) {
        const [svcName, methodName] = svcCall.split('.');
        if (methodName) {
          chain.serviceMethod = {
            serviceName: svcName,
            methodName,
            file: backendRoute.file,
          };

          // Resolve Prisma models
          const models = resolveRouteModels(backendRoute, serviceModelMap, serviceTraces);
          chain.prismaModels = models;
          break; // Take the first service call
        }
      }
    }
  }

  return chain;
}

// ===== Step 5: Classify interaction =====

function classifyInteraction(
  chain: InteractionChain,
  facades: FacadeEntry[],
  componentHasSave: boolean,
): void {
  // Already classified as navigation/noop/dead
  if (chain.status !== 'AUSENTE' || chain.handlerType === 'navigation') return;

  // AUSENTE: no handler or dead
  if (!chain.handler || chain.handlerType === 'noop' || chain.handlerType === 'dead') {
    chain.status = 'AUSENTE';
    chain.statusReason = chain.handlerType === 'noop'
      ? 'Noop handler'
      : chain.handlerType === 'dead'
        ? 'Dead handler'
        : 'No handler';
    return;
  }

  // Check for facade indicators near this element
  const nearbyFacades = facades.filter(f =>
    f.file === chain.componentFile &&
    Math.abs(f.line - chain.elementLine) < 40
  );

  if (nearbyFacades.length > 0) {
    chain.status = 'FACHADA';
    chain.statusReason = `Facade detected: ${nearbyFacades[0].type} — ${nearbyFacades[0].description}`;
    chain.facadeEvidence = nearbyFacades.map(f => `[${f.type}] ${f.evidence}`);
    return;
  }

  // No API call found
  if (!chain.apiCall) {
    // Check for pure UI handlers that are legitimate without API calls
    const handler = chain.handler || '';
    const isPureUIHandler =
      // Navigation
      /router\.back\s*\(|router\.push\s*\(|router\.replace\s*\(|window\.location|window\.open/.test(handler) ||
      // Clipboard
      /clipboard|handleCopy|copyToClipboard|navigator\.clipboard/.test(handler) ||
      // Download/file
      /download|handleDownload|handleExport|URL\.createObjectURL|Blob\s*\(/.test(handler) ||
      // Print
      /window\.print|handlePrint/.test(handler) ||
      // Scroll
      /scrollTo|scrollIntoView/.test(handler) ||
      // Modal/drawer open/close (UI state that requires no persistence)
      /^(?:\(\)\s*=>\s*)?(?:set(?:Show|Open|Visible|IsOpen|Modal|Drawer)|open|close|toggle(?:Modal|Drawer|Menu|Sidebar))/.test(handler) ||
      // Tab/filter/sort changes (local UI state)
      /^(?:\(\)\s*=>\s*)?(?:set(?:Active|Selected|Current)(?:Tab|Filter|Sort|View|Section|Page))/.test(handler);

    if (isPureUIHandler) {
      chain.status = 'FUNCIONA';
      chain.statusReason = 'Pure UI handler (navigation/clipboard/modal/tab)';
      return;
    }

    // If it's a state-only handler in a component with a save button, it's OK
    if (componentHasSave && chain.handlerType === 'real') {
      chain.status = 'FUNCIONA';
      chain.statusReason = 'State handler in component with save handler';
      return;
    }

    // Handler is real but no API call — likely FACHADA (local state only, never saved)
    chain.status = 'FACHADA';
    chain.statusReason = 'Handler exists but no API call detected — local state only';
    return;
  }

  // API call exists but no backend route found
  if (!chain.backendRoute) {
    chain.status = 'QUEBRADO';
    chain.statusReason = `API call to ${chain.apiCall.endpoint} has no matching backend route`;
    return;
  }

  // Backend route exists but no service method resolved
  if (!chain.serviceMethod) {
    chain.status = 'INCOMPLETO';
    chain.statusReason = `Route ${chain.backendRoute.fullPath} exists but no service method resolved`;
    return;
  }

  // Service exists but no Prisma models (could be legit for non-DB operations)
  if (chain.prismaModels.length === 0 && chain.serviceMethod) {
    // Some operations don't need DB (e.g., Redis, external API, file ops)
    chain.status = 'FUNCIONA';
    chain.statusReason = 'Complete chain (no Prisma — may use Redis/external API)';
    return;
  }

  // Complete chain: API → route → service → Prisma
  if (chain.apiCall && chain.backendRoute) {
    chain.status = 'FUNCIONA';
    chain.statusReason = chain.prismaModels.length > 0
      ? `Complete chain → ${chain.prismaModels.join(', ')}`
      : 'Complete chain (route matched)';
    return;
  }

  chain.status = 'INCOMPLETO';
  chain.statusReason = 'Partial chain — could not fully resolve';
}

// ===== Step 6: Extract data sources (useSWR/GET) per page =====

function extractDataSources(
  componentFiles: string[],
  apiCalls: APICall[],
  routeLookup: Map<RouteKey, BackendRoute>,
  proxyRoutes: ProxyRoute[],
  rootDir: string,
): DataSource[] {
  const sources: DataSource[] = [];
  const seen = new Set<string>();

  for (const absFile of componentFiles) {
    const relFile = path.relative(rootDir, absFile);
    const fileSwrCalls = apiCalls.filter(c =>
      c.file === relFile && c.callPattern === 'useSWR'
    );

    for (const call of fileSwrCalls) {
      const key = `${call.normalizedPath}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const mockCall: APICall = { ...call };
      const route = matchApiCallToRoute(mockCall, routeLookup, proxyRoutes);

      sources.push({
        hook: 'useSWR',
        endpoint: call.normalizedPath,
        file: call.file,
        line: call.line,
        hasBackendRoute: !!route,
      });
    }
  }

  return sources;
}

// ===== Main: Build functional map =====

export function buildFunctionalMap(
  config: PulseConfig,
  coreData: CoreParserData,
): FunctionalMapResult {
  const {
    uiElements, apiCalls, backendRoutes, serviceTraces,
    proxyRoutes, facades, hookRegistry,
  } = coreData;

  // Build lookup structures (reuse graph.ts functions)
  const routeLookup = buildRouteLookup(backendRoutes, config.globalPrefix);
  const serviceModelMap = buildServiceModelMap(serviceTraces);
  const apiModuleMap = buildApiModuleMap(config);

  // Step 1: Discover pages
  const pageEntries = findAllPages(config);

  // Step 2: Resolve component trees
  const pageComponentTrees = new Map<string, string[]>();
  for (const page of pageEntries) {
    if (page.isRedirect) {
      pageComponentTrees.set(page.route, [page.pageFile]);
    } else {
      const tree = resolveComponentTree(page.pageFile, config.frontendDir);
      pageComponentTrees.set(page.route, tree);
    }
  }

  // Step 3: Group UI elements by page
  const elemsByPage = groupElementsByPage(pageEntries, pageComponentTrees, uiElements, config.rootDir);

  // Build file content cache for deeper handler analysis
  const fileContentCache = new Map<string, string>();
  for (const el of uiElements) {
    if (!fileContentCache.has(el.file)) {
      try {
        const absPath = path.join(config.rootDir, el.file);
        fileContentCache.set(el.file, fs.readFileSync(absPath, 'utf8'));
      } catch { /* skip */ }
    }
  }

  // Detect which components have save handlers
  const SAVE_HANDLER_RE = /(?:const|function|async function)\s+(?:handleSave|save|handleSubmit|onSubmit|onSave|handleUpdate|handleCreate|submitForm|doSave)\s*(?:=|\()/;
  const componentHasSaveMap = new Map<string, boolean>();
  for (const [relFile, content] of fileContentCache) {
    componentHasSaveMap.set(relFile, SAVE_HANDLER_RE.test(content));
  }

  // Step 4+5: Trace and classify each interaction
  const pages: PageFunctionalMap[] = [];

  for (const page of pageEntries) {
    const elements = elemsByPage.get(page.route) || [];
    const interactions: InteractionChain[] = [];

    for (const el of elements) {
      // Skip navigation-only elements from counting
      if (el.handlerType === 'navigation') continue;

      const chain = traceInteractionChain(
        el, page, apiCalls, routeLookup, proxyRoutes,
        serviceModelMap, serviceTraces, hookRegistry, apiModuleMap,
        fileContentCache,
      );

      const componentHasSave = componentHasSaveMap.get(el.file) || false;
      classifyInteraction(chain, facades, componentHasSave);
      interactions.push(chain);
    }

    // Step 6: Data sources
    const tree = pageComponentTrees.get(page.route) || [];
    const dataSources = extractDataSources(tree, apiCalls, routeLookup, proxyRoutes, config.rootDir);

    // Counts
    const counts: Record<InteractionStatus, number> = {
      FUNCIONA: 0, FACHADA: 0, QUEBRADO: 0, INCOMPLETO: 0, AUSENTE: 0,
    };
    for (const i of interactions) {
      counts[i.status]++;
    }

    pages.push({
      route: page.route,
      pageFile: page.relFile,
      group: page.group,
      isRedirect: page.isRedirect,
      redirectTarget: page.redirectTarget,
      componentFiles: tree.map(f => path.relative(config.rootDir, f)),
      interactions,
      dataSources,
      counts,
      totalInteractions: interactions.length,
    });
  }

  // Summary
  const totalByStatus: Record<InteractionStatus, number> = {
    FUNCIONA: 0, FACHADA: 0, QUEBRADO: 0, INCOMPLETO: 0, AUSENTE: 0,
  };
  const byGroup: Record<string, Record<InteractionStatus, number>> = {};
  let totalInteractions = 0;
  let redirectPages = 0;

  for (const page of pages) {
    if (page.isRedirect) redirectPages++;
    totalInteractions += page.totalInteractions;

    for (const [status, count] of Object.entries(page.counts)) {
      totalByStatus[status as InteractionStatus] += count;
    }

    if (!byGroup[page.group]) {
      byGroup[page.group] = { FUNCIONA: 0, FACHADA: 0, QUEBRADO: 0, INCOMPLETO: 0, AUSENTE: 0 };
    }
    for (const [status, count] of Object.entries(page.counts)) {
      byGroup[page.group][status as InteractionStatus] += count;
    }
  }

  // Functional score: weighted
  const total = totalInteractions || 1;
  const functionalScore = Math.round(
    ((totalByStatus.FUNCIONA * 1.0 + totalByStatus.INCOMPLETO * 0.5) / total) * 100
  );

  return {
    pages,
    summary: {
      totalPages: pages.length,
      totalInteractions,
      redirectPages,
      byStatus: totalByStatus,
      byGroup,
      functionalScore: Math.min(100, Math.max(0, functionalScore)),
    },
    timestamp: new Date().toISOString(),
  };
}
