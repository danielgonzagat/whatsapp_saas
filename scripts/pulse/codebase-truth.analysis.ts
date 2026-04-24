/** Semantic analysis helpers for codebase-truth: token scoring, flow discovery, divergence. */

import type {
  BackendRoute,
  PulseDiscoveredFlowCandidate,
  PulseDiscoveredModule,
  PulseManifest,
  PulseTruthDivergence,
  PulseTruthPageSummary,
} from './types';
import type { CoreParserData, InteractionChain, PageFunctionalMap } from './functional-map-types';

const ROUTE_NOISE_TOKENS = new Set([
  'api',
  'app',
  'apps',
  'page',
  'pages',
  'route',
  'routes',
  'main',
  'public',
  'checkout',
  'auth',
  'e2e',
  'internal',
  'index',
  'new',
  'edit',
  'view',
]);

const SEMANTIC_NOISE_TOKENS = new Set([
  ...ROUTE_NOISE_TOKENS,
  'src',
  'frontend',
  'backend',
  'component',
  'components',
  'hook',
  'hooks',
  'helper',
  'helpers',
  'shared',
  'common',
  'core',
  'lib',
  'utils',
  'utility',
  'provider',
  'providers',
  'context',
  'contexts',
  'layout',
  'section',
  'sections',
  'widget',
  'widgets',
  'module',
  'modules',
  'button',
  'buttons',
  'form',
  'forms',
  'card',
  'cards',
  'panel',
  'panels',
  'dialog',
  'modal',
  'sheet',
  'tab',
  'tabs',
  'table',
  'list',
  'item',
  'items',
  'state',
  'data',
  'value',
  'values',
  'default',
  'variant',
  'variants',
  'line',
  'font',
  'family',
  'margin',
  'padding',
  'center',
  'left',
  'right',
  'top',
  'bottom',
  'relative',
  'absolute',
  'rounded',
  'transition',
  'duration',
  'color',
  'background',
  'size',
  'width',
  'height',
  'texto',
  'sem',
  'id',
  'ids',
  'no',
  'but',
  'call',
  'calls',
  'detected',
  'exists',
  'exist',
  'method',
  'handler',
  'http',
  'https',
  'use',
  'swr',
  'brand',
  'client',
  'copy',
  'clipboard',
]);

export function normalizeText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && /[a-z]/.test(token));
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

export function singularize(value: string): string {
  if (value.endsWith('ies') && value.length > 3) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith('ses') || value.endsWith('ss')) {
    return value;
  }
  if (value.endsWith('s') && value.length > 3) {
    return value.slice(0, -1);
  }
  return value;
}

export function getRouteSegments(route: string): string[] {
  return route
    .split('/')
    .filter(Boolean)
    .filter((segment) => !segment.startsWith(':'));
}

export function isUserFacingGroup(group: string): boolean {
  return group === 'main' || group === 'public' || group === 'checkout';
}

export function shouldIgnoreSemanticToken(token: string): boolean {
  return !token || SEMANTIC_NOISE_TOKENS.has(token) || token.length < 2 || !/[a-z]/.test(token);
}

export function basenameWithoutExt(filePath: string): string {
  const fileName = filePath.split('/').pop() || filePath;
  return fileName.replace(/\.[^.]+$/u, '');
}

export function extractRootToken(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const rawSegments = String(value)
    .split('/')
    .flatMap((segment) => tokenize(segment))
    .flatMap((segment) => [segment, singularize(segment)]);
  return rawSegments.find((token) => !shouldIgnoreSemanticToken(token)) || null;
}

function addWeightedTokens(
  scores: Map<string, number>,
  value: string | null | undefined,
  weight: number,
) {
  if (!value || weight <= 0) {
    return;
  }
  for (const baseToken of tokenize(value)) {
    const variants = unique([baseToken, singularize(baseToken)]).filter(Boolean);
    for (const token of variants) {
      if (shouldIgnoreSemanticToken(token)) {
        continue;
      }
      scores.set(token, (scores.get(token) || 0) + weight);
    }
  }
}

function orderTokens(scores: Map<string, number>): string[] {
  return [...scores.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([token]) => token);
}

export interface SemanticTokenProfile {
  orderedTokens: string[];
  structuralTokens: string[];
  rootTokens: string[];
  dominantRoot: string | null;
}

export function buildPageSemanticProfile(page: PageFunctionalMap): SemanticTokenProfile {
  const allScores = new Map<string, number>();
  const structuralScores = new Map<string, number>();
  const rootScores = new Map<string, number>();

  addWeightedTokens(allScores, page.route, 3);
  addWeightedTokens(allScores, page.group, 1);
  addWeightedTokens(allScores, basenameWithoutExt(page.pageFile), 2);

  for (const componentFile of page.componentFiles) {
    addWeightedTokens(allScores, basenameWithoutExt(componentFile), 1);
  }

  for (const interaction of page.interactions) {
    addWeightedTokens(allScores, interaction.elementLabel, 1);
    addWeightedTokens(allScores, interaction.handler || '', 1);
    if (interaction.apiCall) {
      addWeightedTokens(allScores, interaction.apiCall.endpoint, 3);
      addWeightedTokens(structuralScores, interaction.apiCall.endpoint, 3);
      addWeightedTokens(rootScores, extractRootToken(interaction.apiCall.endpoint), 3);
    }
    if (interaction.backendRoute) {
      addWeightedTokens(allScores, interaction.backendRoute.fullPath, 5);
      addWeightedTokens(structuralScores, interaction.backendRoute.fullPath, 5);
      addWeightedTokens(allScores, interaction.backendRoute.methodName, 2);
      addWeightedTokens(structuralScores, interaction.backendRoute.methodName, 2);
      addWeightedTokens(rootScores, extractRootToken(interaction.backendRoute.fullPath), 5);
    }
    if (interaction.serviceMethod) {
      addWeightedTokens(allScores, interaction.serviceMethod.serviceName, 4);
      addWeightedTokens(structuralScores, interaction.serviceMethod.serviceName, 4);
      addWeightedTokens(allScores, interaction.serviceMethod.methodName, 2);
      addWeightedTokens(structuralScores, interaction.serviceMethod.methodName, 2);
      addWeightedTokens(rootScores, tokenize(interaction.serviceMethod.serviceName)[0] || '', 4);
    }
    for (const prismaModel of interaction.prismaModels) {
      addWeightedTokens(allScores, prismaModel, 4);
      addWeightedTokens(structuralScores, prismaModel, 4);
      addWeightedTokens(rootScores, tokenize(prismaModel)[0] || '', 4);
    }
  }

  for (const dataSource of page.dataSources) {
    addWeightedTokens(allScores, dataSource.endpoint, 3);
    addWeightedTokens(structuralScores, dataSource.endpoint, 3);
    addWeightedTokens(allScores, dataSource.hook, 2);
    addWeightedTokens(rootScores, extractRootToken(dataSource.endpoint), 3);
  }

  const orderedTokens = orderTokens(allScores);
  const structuralTokens = orderTokens(structuralScores);
  const orderedRootEntries = [...rootScores.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });
  const rootTokens = orderedRootEntries.map(([token]) => token);
  const [topRoot, secondRoot] = orderedRootEntries;
  const dominantRoot =
    topRoot && (!secondRoot || topRoot[1] >= secondRoot[1] + 2 || topRoot[1] >= secondRoot[1] * 1.5)
      ? topRoot[0]
      : null;

  return { orderedTokens, structuralTokens, rootTokens, dominantRoot };
}

export function isLikelyMutation(interaction: InteractionChain): boolean {
  if (!interaction.apiCall) {
    return false;
  }
  if (interaction.apiCall.method && interaction.apiCall.method.toUpperCase() !== 'GET') {
    return true;
  }
  return /\b(save|create|update|delete|remove|add|send|submit|pay|upload|sync|connect|approve|withdraw|checkout)\b/i.test(
    `${interaction.elementLabel} ${interaction.handler || ''} ${interaction.apiCall.endpoint}`,
  );
}

function scoreDeclaredMatch(tokensA: string[], tokensB: string[]): number {
  const setB = new Set(tokensB);
  return tokensA.filter((token) => setB.has(token)).length;
}

function matchDeclaredFlow(
  candidate: Omit<PulseDiscoveredFlowCandidate, 'declaredFlow'>,
  manifest: PulseManifest | null,
): string | null {
  if (!manifest) {
    return null;
  }
  const candidateTokens = unique([
    ...tokenize(candidate.moduleName),
    ...tokenize(candidate.moduleKey),
    ...tokenize(candidate.pageRoute),
    ...tokenize(candidate.elementLabel),
    ...tokenize(candidate.endpoint),
    ...tokenize(candidate.backendRoute || ''),
    ...(candidate.semanticTokens || []),
  ]);
  let best: { id: string; score: number } | null = null;
  for (const spec of manifest.flowSpecs) {
    const specTokens = unique([
      ...tokenize(spec.id),
      ...tokenize(spec.notes),
      ...tokenize(spec.surface),
      ...tokenize(spec.oracle),
      ...tokenize(spec.runner),
    ]);
    const score = scoreDeclaredMatch(candidateTokens, specTokens);
    if (score > (best?.score || 0)) {
      best = { id: spec.id, score };
    }
  }
  return best && best.score >= 2 ? best.id : null;
}

export function buildDiscoveredFlows(
  pages: PageFunctionalMap[],
  manifest: PulseManifest | null,
  buildPageSemanticProfileFn: (page: PageFunctionalMap) => SemanticTokenProfile,
  buildGenericModuleAliasFn: (
    route: string,
    group: string,
    semanticTokens?: string[],
    structuralTokens?: string[],
    rootTokens?: string[],
    dominantRoot?: string | null,
  ) => { key: string; name: string; tokens: string[] },
): PulseDiscoveredFlowCandidate[] {
  const byId = new Map<string, PulseDiscoveredFlowCandidate>();

  for (const page of pages) {
    if (!isUserFacingGroup(page.group)) {
      continue;
    }
    const semanticProfile = buildPageSemanticProfileFn(page);
    const moduleAlias = buildGenericModuleAliasFn(
      page.route,
      page.group,
      semanticProfile.orderedTokens,
      semanticProfile.structuralTokens,
      semanticProfile.rootTokens,
      semanticProfile.dominantRoot,
    );

    for (const interaction of page.interactions) {
      if (!isLikelyMutation(interaction) || !interaction.apiCall) {
        continue;
      }
      const endpoint = interaction.backendRoute?.fullPath || interaction.apiCall.endpoint;
      const flowId = slugify(`${moduleAlias.key}-${interaction.apiCall.method}-${endpoint}`);
      if (!flowId) {
        continue;
      }

      const current = byId.get(flowId);
      const base = {
        id: flowId,
        moduleKey: moduleAlias.key,
        moduleName: moduleAlias.name,
        pageRoute: page.route,
        elementLabel: interaction.elementLabel,
        httpMethod: interaction.apiCall.method,
        endpoint,
        backendRoute: interaction.backendRoute?.fullPath || null,
        connected: !!interaction.backendRoute,
        persistent: interaction.prismaModels.length > 0,
        semanticTokens: unique([
          ...semanticProfile.orderedTokens,
          ...tokenize(interaction.elementLabel),
          ...tokenize(interaction.handler || ''),
          ...tokenize(endpoint),
          ...tokenize(interaction.backendRoute?.fullPath || ''),
          ...tokenize(interaction.serviceMethod?.serviceName || ''),
          ...tokenize(interaction.serviceMethod?.methodName || ''),
          ...interaction.prismaModels.flatMap(tokenize),
        ]),
      };

      if (current) {
        current.connected = current.connected || base.connected;
        current.persistent = current.persistent || base.persistent;
        if (current.elementLabel === '(sem texto)' && base.elementLabel !== '(sem texto)') {
          current.elementLabel = base.elementLabel;
        }
        current.semanticTokens = unique([
          ...(current.semanticTokens || []),
          ...base.semanticTokens,
        ]);
        continue;
      }

      byId.set(flowId, { ...base, declaredFlow: null });
    }
  }

  const flows = [...byId.values()];
  for (const candidate of flows) {
    candidate.declaredFlow = matchDeclaredFlow(candidate, manifest);
  }

  return flows.sort((a, b) => a.id.localeCompare(b.id));
}

export function inferBackendCapabilityWithoutFrontendSurface(
  backendRoutes: BackendRoute[],
  discoveredModules: PulseDiscoveredModule[],
): string[] {
  const discoveredKeys = new Set(discoveredModules.map((item) => item.key));
  const counts = new Map<string, { name: string; count: number }>();

  for (const route of backendRoutes) {
    const segments = route.fullPath
      .replace(/^\/+/g, '')
      .split('/')
      .filter(Boolean)
      .filter((segment) => !segment.startsWith(':'))
      .filter((segment) => !['api', 'v1', 'kloel'].includes(segment.toLowerCase()));

    const root = unique(
      segments
        .flatMap((segment) => tokenize(segment))
        .flatMap((segment) => [segment, singularize(segment)])
        .filter((segment) => !shouldIgnoreSemanticToken(segment)),
    )[0];
    if (!root) {
      continue;
    }
    const key = slugify(root);
    const name = titleCase(root);
    const current = counts.get(key);
    counts.set(key, { name, count: (current?.count || 0) + 1 });
  }

  return [...counts.entries()]
    .filter(([key, value]) => key !== 'misc' && value.count >= 3 && !discoveredKeys.has(key))
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, value]) => `${value.name} (${value.count} routes)`);
}

export function buildDivergence(
  pages: PulseTruthPageSummary[],
  discoveredModules: PulseDiscoveredModule[],
  discoveredFlows: PulseDiscoveredFlowCandidate[],
  manifest: PulseManifest | null,
  coreData: CoreParserData,
): PulseTruthDivergence {
  const discoveredDeclaredModules = new Set(
    discoveredModules
      .map((item) => item.declaredModule)
      .filter((value): value is string => Boolean(value)),
  );

  const declaredNotDiscovered = manifest
    ? manifest.modules
        .filter((entry) => !discoveredDeclaredModules.has(entry.name))
        .map((entry) => entry.name)
        .sort()
    : [];

  const discoveredNotDeclared = discoveredModules
    .filter((item) => item.userFacing && !item.declaredModule)
    .map((item) => item.name)
    .sort();

  const declaredButInternal = discoveredModules
    .filter((item) => item.declaredModule && item.state === 'INTERNAL')
    .map((item) => item.declaredModule as string)
    .sort();

  const frontendSurfaceWithoutBackendSupport = pages
    .filter(
      (page) =>
        page.shellComplexity !== 'light' &&
        ((page.apiBoundInteractions > 0 && page.backendBoundInteractions === 0) ||
          (page.totalDataSources > 0 && page.backedDataSources === 0)),
    )
    .map(
      (page) =>
        `${page.route} (api=${page.apiBoundInteractions}, backedData=${page.backedDataSources}/${page.totalDataSources})`,
    )
    .sort();

  const shellWithoutPersistence = pages
    .filter(
      (page) =>
        page.shellComplexity !== 'light' &&
        page.totalInteractions >= 5 &&
        page.facadeInteractions +
          page.brokenInteractions +
          page.incompleteInteractions +
          page.absentInteractions >
          0 &&
        page.persistedInteractions === 0 &&
        page.backedDataSources === 0,
    )
    .map((page) => `${page.route} (${page.shellComplexity} shell)`)
    .sort();

  const flowCandidatesWithoutOracle = discoveredFlows
    .filter((item) => (item.connected || item.persistent) && !item.declaredFlow)
    .map((item) => `${item.id} -> ${item.pageRoute}`)
    .sort();

  const backendCapabilityWithoutFrontendSurface = inferBackendCapabilityWithoutFrontendSurface(
    coreData.backendRoutes,
    discoveredModules,
  );

  const blockerCount =
    declaredNotDiscovered.length +
    discoveredNotDeclared.length +
    flowCandidatesWithoutOracle.length;
  const warningCount =
    declaredButInternal.length +
    frontendSurfaceWithoutBackendSupport.length +
    backendCapabilityWithoutFrontendSurface.length +
    shellWithoutPersistence.length;

  return {
    declaredNotDiscovered,
    discoveredNotDeclared,
    declaredButInternal,
    frontendSurfaceWithoutBackendSupport,
    backendCapabilityWithoutFrontendSurface,
    shellWithoutPersistence,
    flowCandidatesWithoutOracle,
    blockerCount,
    warningCount,
  };
}
