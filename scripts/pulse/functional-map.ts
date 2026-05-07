// PULSE — Functional Map Builder
// Traces every page → every interactive element → handler → API → backend → service → Prisma
// Classifies each interaction: FUNCIONA | FACHADA | QUEBRADO | INCOMPLETO | AUSENTE
import { safeJoin } from './safe-path';

import * as path from 'path';
import type { PulseConfig } from './types.manifest';
import type {
  UIElement,
  APICall,
  BackendRoute,
  ServiceTrace,
  ProxyRoute,
  FacadeEntry,
} from './types.core';
import type { HookRegistry } from './parsers/hook-registry';
import type {
  InteractionStatus,
  InteractionChain,
  DataSource,
  PageFunctionalMap,
  FunctionalMapResult,
  PageEntry,
  CoreParserData,
} from './functional-map-types';
import { normalizeForMatch, type RouteKey } from './graph/__parts__/graph-part1-core';
import {
  buildRouteLookup,
  matchApiCallToRoute,
  buildServiceModelMap,
  resolveRouteModels,
} from './graph/__parts__/graph-part2-routing';
import { buildApiModuleMap } from './parsers/api-parser';
import { pathExists, readTextFile } from './safe-fs';
import {
  findApiCallForElement,
  groupElementsByPage,
} from './functional-map.helpers/__parts__/public';
import { findAllPages, resolveComponentTree } from './functional-map-pages';
import { traceInteractionChain, classifyInteraction } from './functional-map-classify';
import { deriveStringUnionMembersFromTypeContract } from './dynamic-reality-kernel/__parts__/type-contract-labels';

function buildInteractionStatusCounter(): Record<InteractionStatus, number> {
  return Object.fromEntries(
    [
      ...deriveStringUnionMembersFromTypeContract(
        'scripts/pulse/functional-map-types.ts',
        'InteractionStatus',
      ),
    ].map((status) => [status, 0]),
  ) as Record<InteractionStatus, number>;
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
    const fileSwrCalls = apiCalls.filter((c) => c.file === relFile && c.callPattern === 'useSWR');

    for (const call of fileSwrCalls) {
      const key = `${call.normalizedPath}`;
      if (seen.has(key)) {
        continue;
      }
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
  const { uiElements, apiCalls, backendRoutes, serviceTraces, proxyRoutes, facades, hookRegistry } =
    coreData;

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
      const tree = resolveComponentTree(page.pageFile, page.frontendDir);
      pageComponentTrees.set(page.route, tree);
    }
  }

  // Step 3: Group UI elements by page
  const elemsByPage = groupElementsByPage(
    pageEntries,
    pageComponentTrees,
    uiElements,
    config.rootDir,
  );

  // Build file content cache for deeper handler analysis
  const fileContentCache = new Map<string, string>();
  for (const el of uiElements) {
    if (!fileContentCache.has(el.file)) {
      try {
        const absPath = safeJoin(config.rootDir, el.file);
        fileContentCache.set(el.file, readTextFile(absPath, 'utf8'));
      } catch {
        /* skip */
      }
    }
  }

  // Detect which components have save handlers
  const SAVE_HANDLER_RE =
    /(?:const|function|async function)\s+(?:handleSave|save|handleSubmit|onSubmit|onSave|handleUpdate|handleCreate|submitForm|doSave)\s*(?:=|\()/;
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
      if (el.handlerType === 'navigation') {
        continue;
      }

      const chain = traceInteractionChain(
        el,
        page,
        apiCalls,
        routeLookup,
        proxyRoutes,
        serviceModelMap,
        serviceTraces,
        hookRegistry,
        apiModuleMap,
        fileContentCache,
      );

      const componentHasSave = componentHasSaveMap.get(el.file) || false;
      classifyInteraction(chain, facades, componentHasSave);
      interactions.push(chain);
    }

    // Step 6: Data sources
    const tree = pageComponentTrees.get(page.route) || [];
    const dataSources = extractDataSources(
      tree,
      apiCalls,
      routeLookup,
      proxyRoutes,
      config.rootDir,
    );

    // Counts
    const counts = buildInteractionStatusCounter();
    for (const i of interactions) {
      counts[i.status]++;
    }

    pages.push({
      route: page.route,
      pageFile: page.relFile,
      group: page.group,
      isRedirect: page.isRedirect,
      redirectTarget: page.redirectTarget,
      componentFiles: tree.map((f) => path.relative(config.rootDir, f)),
      interactions,
      dataSources,
      counts,
      totalInteractions: interactions.length,
    });
  }

  // Summary
  const totalByStatus = buildInteractionStatusCounter();
  const byGroup: Record<string, Record<InteractionStatus, number>> = {};
  let totalInteractions = 0;
  let redirectPages = 0;

  for (const page of pages) {
    if (page.isRedirect) {
      redirectPages++;
    }
    totalInteractions += page.totalInteractions;

    for (const [status, count] of Object.entries(page.counts)) {
      totalByStatus[status as InteractionStatus] += count;
    }

    if (!byGroup[page.group]) {
      byGroup[page.group] = buildInteractionStatusCounter();
    }
    for (const [status, count] of Object.entries(page.counts)) {
      byGroup[page.group][status as InteractionStatus] += count;
    }
  }

  // Functional score: weighted
  const total = totalInteractions || 1;
  const functionalScore = Math.round(
    ((totalByStatus.FUNCIONA * 1.0 + totalByStatus.INCOMPLETO * 0.5) / total) * 100,
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

// Re-export for callers that import from here
export { findAllPages, resolveComponentTree } from './functional-map-pages';
