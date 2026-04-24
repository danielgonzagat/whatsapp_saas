import type {
  BackendRoute,
  PulseCodebaseTruth,
  PulseConfig,
  PulseDiscoveredModule,
  PulseManifest,
  PulseModuleState,
  PulseShellComplexity,
  PulseTruthPageSummary,
} from './types';
import type { CoreParserData, PageFunctionalMap } from './functional-map-types';
import { buildFunctionalMap } from './functional-map';
import {
  normalizeText,
  tokenize,
  slugify,
  unique,
  titleCase,
  singularize,
  getRouteSegments,
  isUserFacingGroup,
  shouldIgnoreSemanticToken,
  basenameWithoutExt,
  extractRootToken,
  buildPageSemanticProfile,
  buildDiscoveredFlows,
  buildDivergence,
  type SemanticTokenProfile,
} from './codebase-truth.analysis';

interface ModuleAlias {
  key: string;
  name: string;
  tokens: string[];
}

interface ModuleBucket extends Omit<PulseDiscoveredModule, 'declaredModule' | 'state' | 'notes'> {
  semanticTokens: string[];
  structuralTokens: string[];
}

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

function buildRouteTokens(route: string, group: string): string[] {
  const segments = getRouteSegments(route)
    .map((segment) => normalizeText(segment))
    .filter(Boolean)
    .filter((segment) => !ROUTE_NOISE_TOKENS.has(segment))
    .flatMap((segment) => [segment, singularize(segment)])
    .filter(Boolean);

  const groupTokens =
    group && !ROUTE_NOISE_TOKENS.has(group)
      ? [normalizeText(group), singularize(normalizeText(group))]
      : [];

  return unique([...segments, ...groupTokens]).filter(Boolean);
}

function buildGenericModuleAlias(
  route: string,
  group: string,
  semanticTokens: string[] = [],
  structuralTokens: string[] = [],
  rootTokens: string[] = [],
  dominantRoot: string | null = null,
): ModuleAlias {
  if (group === 'e2e') {
    return { key: 'e2e', name: 'E2E', tokens: ['e2e'] };
  }

  const routeTokens = buildRouteTokens(route, group);
  const root =
    dominantRoot ||
    routeTokens[0] ||
    rootTokens[0] ||
    structuralTokens[0] ||
    semanticTokens[0] ||
    (group === 'public' ? 'public' : group || 'misc');
  const key = slugify(root || 'misc') || 'misc';
  const name = titleCase(root || 'Misc');
  const tokens = unique([
    ...structuralTokens,
    ...semanticTokens,
    ...routeTokens,
    ...tokenize(route),
    ...tokenize(group),
    key,
    singularize(key),
  ]).filter(Boolean);

  return { key, name, tokens };
}

function getRouteRoot(route: string, group: string): string {
  const alias = buildGenericModuleAlias(route, group);
  if (!alias.key || alias.key === 'misc') {
    return group === 'public' ? '/' : group;
  }
  return alias.key;
}

function determineShellComplexity(page: PageFunctionalMap): PulseShellComplexity {
  if (
    page.componentFiles.length >= 8 ||
    page.totalInteractions >= 15 ||
    (page.componentFiles.length >= 5 && page.dataSources.length >= 2)
  ) {
    return 'rich';
  }
  if (
    page.componentFiles.length >= 4 ||
    page.totalInteractions >= 6 ||
    page.dataSources.length >= 1
  ) {
    return 'medium';
  }
  return 'light';
}

function buildPageSummary(page: PageFunctionalMap): PulseTruthPageSummary {
  const semanticProfile = buildPageSemanticProfile(page);
  const moduleAlias = buildGenericModuleAlias(
    page.route,
    page.group,
    semanticProfile.orderedTokens,
    semanticProfile.structuralTokens,
    semanticProfile.rootTokens,
    semanticProfile.dominantRoot,
  );
  const apiBoundInteractions = page.interactions.filter((item) => !!item.apiCall).length;
  const backendBoundInteractions = page.interactions.filter((item) => !!item.backendRoute).length;
  const persistedInteractions = page.interactions.filter(
    (item) => item.prismaModels.length > 0,
  ).length;
  const backedDataSources = page.dataSources.filter((item) => item.hasBackendRoute).length;

  return {
    route: page.route,
    group: page.group,
    moduleKey: moduleAlias.key,
    moduleName: moduleAlias.name,
    shellComplexity: determineShellComplexity(page),
    totalInteractions: page.totalInteractions,
    functioningInteractions: page.counts.FUNCIONA || 0,
    facadeInteractions: page.counts.FACHADA || 0,
    brokenInteractions: page.counts.QUEBRADO || 0,
    incompleteInteractions: page.counts.INCOMPLETO || 0,
    absentInteractions: page.counts.AUSENTE || 0,
    apiBoundInteractions,
    backendBoundInteractions,
    persistedInteractions,
    totalDataSources: page.dataSources.length,
    backedDataSources,
    semanticTokens: semanticProfile.orderedTokens,
    structuralTokens: semanticProfile.structuralTokens,
  };
}

function scoreDeclaredMatch(tokensA: string[], tokensB: string[]): number {
  const setB = new Set(tokensB);
  return tokensA.filter((token) => setB.has(token)).length;
}

function matchDeclaredModule(module: ModuleBucket, manifest: PulseManifest | null): string | null {
  if (!manifest) {
    return null;
  }
  const candidateTokens = unique([
    ...tokenize(module.name),
    ...module.routeRoots.flatMap(tokenize),
    ...tokenize(module.key),
    ...(module.semanticTokens || []),
    ...(module.structuralTokens || []),
  ]);
  let best: { name: string; score: number } | null = null;
  for (const entry of manifest.modules) {
    if (module.userFacing && entry.state === 'INTERNAL') {
      continue;
    }
    if (!module.userFacing && entry.state !== 'INTERNAL') {
      continue;
    }
    const entryTokens = unique([...tokenize(entry.name), ...tokenize(entry.notes || '')]);
    const exactName = normalizeText(entry.name) === normalizeText(module.name);
    const score =
      (exactName ? 100 : 0) +
      (entryTokens.includes(module.key) ? 10 : 0) +
      scoreDeclaredMatch(candidateTokens, entryTokens);
    if (score > (best?.score || 0)) {
      best = { name: entry.name, score };
    }
  }
  return best && best.score >= 10 ? best.name : null;
}

function classifyModuleState(module: ModuleBucket): PulseModuleState {
  if (!module.userFacing) {
    return 'INTERNAL';
  }
  const total = Math.max(1, module.totalInteractions);
  const failureLike =
    module.facadeInteractions + module.brokenInteractions + module.absentInteractions;
  const connected =
    module.backendBoundInteractions + module.backedDataSources + module.persistedInteractions;

  if (module.shellComplexity === 'rich' && connected === 0) {
    return 'SHELL_ONLY';
  }
  if (module.facadeInteractions > Math.max(module.functioningInteractions, 0) && connected === 0) {
    return 'MOCKED';
  }
  if (
    module.brokenInteractions + module.absentInteractions >
      module.functioningInteractions + module.incompleteInteractions &&
    connected <= 1
  ) {
    return 'BROKEN';
  }
  if (
    module.functioningInteractions >= Math.max(3, Math.round(total * 0.6)) &&
    failureLike <= Math.max(2, Math.round(total * 0.25)) &&
    connected > 0
  ) {
    return 'READY';
  }
  if (
    module.shellComplexity !== 'light' &&
    module.persistedInteractions === 0 &&
    module.backedDataSources === 0 &&
    module.backendBoundInteractions === 0
  ) {
    return 'SHELL_ONLY';
  }
  return 'PARTIAL';
}

function summarizeModule(
  module: ModuleBucket,
  state: PulseModuleState,
  declaredModule: string | null,
): string {
  const pieces = [
    `${module.pageCount} page(s)`,
    `${module.totalInteractions} interaction(s)`,
    `${module.backendBoundInteractions} backend-bound`,
    `${module.persistedInteractions} persisted`,
    `${module.backedDataSources}/${module.totalDataSources} backed data source(s)`,
    `shell=${module.shellComplexity}`,
  ];
  if (declaredModule) {
    pieces.push(`declared as "${declaredModule}"`);
  }
  if (state === 'SHELL_ONLY') {
    pieces.push('rich frontend shell without persistence evidence');
  }
  if (state === 'MOCKED') {
    pieces.push('facade/local-state signals dominate');
  }
  if (module.structuralTokens.length > 0) {
    pieces.push(`structural=${module.structuralTokens.slice(0, 5).join(', ')}`);
  }
  return pieces.join(', ');
}

/** Extract codebase truth. */
export function extractCodebaseTruth(
  config: PulseConfig,
  coreData: CoreParserData,
  manifest: PulseManifest | null,
): PulseCodebaseTruth {
  const fmap = buildFunctionalMap(config, coreData);
  const pageSummaries = fmap.pages.map(buildPageSummary);
  const buckets = new Map<string, ModuleBucket>();

  for (const page of pageSummaries) {
    const bucket = buckets.get(page.moduleKey) || {
      key: page.moduleKey,
      name: page.moduleName,
      routeRoots: [],
      groups: [],
      userFacing: false,
      shellComplexity: page.shellComplexity,
      pageCount: 0,
      totalInteractions: 0,
      functioningInteractions: 0,
      facadeInteractions: 0,
      brokenInteractions: 0,
      incompleteInteractions: 0,
      absentInteractions: 0,
      apiBoundInteractions: 0,
      backendBoundInteractions: 0,
      persistedInteractions: 0,
      totalDataSources: 0,
      backedDataSources: 0,
      semanticTokens: [],
      structuralTokens: [],
    };

    bucket.routeRoots = unique([...bucket.routeRoots, getRouteRoot(page.route, page.group)]);
    bucket.groups = unique([...bucket.groups, page.group]);
    bucket.userFacing = bucket.userFacing || isUserFacingGroup(page.group);
    bucket.pageCount += 1;
    bucket.totalInteractions += page.totalInteractions;
    bucket.functioningInteractions += page.functioningInteractions;
    bucket.facadeInteractions += page.facadeInteractions;
    bucket.brokenInteractions += page.brokenInteractions;
    bucket.incompleteInteractions += page.incompleteInteractions;
    bucket.absentInteractions += page.absentInteractions;
    bucket.apiBoundInteractions += page.apiBoundInteractions;
    bucket.backendBoundInteractions += page.backendBoundInteractions;
    bucket.persistedInteractions += page.persistedInteractions;
    bucket.totalDataSources += page.totalDataSources;
    bucket.backedDataSources += page.backedDataSources;
    bucket.semanticTokens = unique([...bucket.semanticTokens, ...(page.semanticTokens || [])]);
    bucket.structuralTokens = unique([
      ...bucket.structuralTokens,
      ...(page.structuralTokens || []),
    ]);
    if (
      page.shellComplexity === 'rich' ||
      (page.shellComplexity === 'medium' && bucket.shellComplexity === 'light')
    ) {
      bucket.shellComplexity = page.shellComplexity;
    }
    buckets.set(page.moduleKey, bucket);
  }

  const discoveredModules = [...buckets.values()]
    .map<PulseDiscoveredModule>((bucket) => {
      const declaredModule = matchDeclaredModule(bucket, manifest);
      const state = classifyModuleState(bucket);
      return {
        ...bucket,
        declaredModule,
        state,
        notes: summarizeModule(bucket, state, declaredModule),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const discoveredFlows = buildDiscoveredFlows(
    fmap.pages,
    manifest,
    buildPageSemanticProfile,
    buildGenericModuleAlias,
  );
  const divergence = buildDivergence(
    pageSummaries,
    discoveredModules,
    discoveredFlows,
    manifest,
    coreData,
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPages: pageSummaries.length,
      userFacingPages: pageSummaries.filter((page) => isUserFacingGroup(page.group)).length,
      discoveredModules: discoveredModules.length,
      discoveredFlows: discoveredFlows.length,
      blockerCount: divergence.blockerCount,
      warningCount: divergence.warningCount,
    },
    pages: pageSummaries,
    discoveredModules,
    discoveredFlows,
    divergence,
  };
}
