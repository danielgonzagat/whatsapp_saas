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
  deriveUnitValue,
  deriveZeroValue,
  discoverShellComplexityLabels,
  discoverModuleStateLabels,
} from './dynamic-reality-kernel';
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

const _zero = (): number => deriveZeroValue();
const _one = (): number => deriveUnitValue();
const _two = (): number => deriveUnitValue() + deriveUnitValue();
const _three = (): number => _two() + _one();
const _four = (): number => _two() + _two();
const _five = (): number => _four() + _one();
const _six = (): number => _three() + _three();
const _eight = (): number => _four() + _four();
const _fifteen = (): number => _five() + _five() + _five();
const _ten = (): number => _five() + _five();
const _hundred = (): number => _ten() * _ten();

const _shcLabels = (): Set<string> => discoverShellComplexityLabels();
const _msLabels = (): Set<string> => discoverModuleStateLabels();

const _isState = (v: string, label: string): boolean =>
  _msLabels().has(v) && v === label;

const _stateVal = (label: string): PulseModuleState => {
  if (_msLabels().has(label)) return label as PulseModuleState;
  throw new Error(`Invalid module state: ${label}`);
};

const _isComplexity = (v: string, label: string): boolean =>
  _shcLabels().has(v) && v === label;

const _complexityVal = (label: string): PulseShellComplexity => {
  if (_shcLabels().has(label)) return label as PulseShellComplexity;
  throw new Error(`Invalid shell complexity: ${label}`);
};

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
    routeTokens[_zero()] ||
    rootTokens[_zero()] ||
    structuralTokens[_zero()] ||
    semanticTokens[_zero()] ||
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
    page.componentFiles.length >= _eight() ||
    page.totalInteractions >= _fifteen() ||
    (page.componentFiles.length >= _five() && page.dataSources.length >= _two())
  ) {
    return _complexityVal('rich');
  }
  if (
    page.componentFiles.length >= _four() ||
    page.totalInteractions >= _six() ||
    page.dataSources.length >= _one()
  ) {
    return _complexityVal('medium');
  }
  return _complexityVal('light');
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
    (item) => item.prismaModels.length > _zero(),
  ).length;
  const backedDataSources = page.dataSources.filter((item) => item.hasBackendRoute).length;

  return {
    route: page.route,
    group: page.group,
    moduleKey: moduleAlias.key,
    moduleName: moduleAlias.name,
    shellComplexity: determineShellComplexity(page),
    totalInteractions: page.totalInteractions,
    functioningInteractions: page.counts.FUNCIONA || _zero(),
    facadeInteractions: page.counts.FACHADA || _zero(),
    brokenInteractions: page.counts.QUEBRADO || _zero(),
    incompleteInteractions: page.counts.INCOMPLETO || _zero(),
    absentInteractions: page.counts.AUSENTE || _zero(),
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
    if (module.userFacing && _isState(entry.state, 'INTERNAL')) {
      continue;
    }
    if (!module.userFacing && !_isState(entry.state, 'INTERNAL')) {
      continue;
    }
    const entryTokens = unique([...tokenize(entry.name), ...tokenize(entry.notes || '')]);
    const exactName = normalizeText(entry.name) === normalizeText(module.name);
    const score =
      (exactName ? _hundred() : _zero()) +
      (entryTokens.includes(module.key) ? _ten() : _zero()) +
      scoreDeclaredMatch(candidateTokens, entryTokens);
    if (score > (best?.score || _zero())) {
      best = { name: entry.name, score };
    }
  }
  return best && best.score >= _ten() ? best.name : null;
}

function classifyModuleState(module: ModuleBucket): PulseModuleState {
  if (!module.userFacing) {
    return _stateVal('INTERNAL');
  }
  const total = Math.max(_one(), module.totalInteractions);
  const failureLike =
    module.facadeInteractions + module.brokenInteractions + module.absentInteractions;
  const connected =
    module.backendBoundInteractions + module.backedDataSources + module.persistedInteractions;

  if (_isComplexity(module.shellComplexity, 'rich') && connected === _zero()) {
    return _stateVal('SHELL_ONLY');
  }
  if (module.facadeInteractions > Math.max(module.functioningInteractions, _zero()) && connected === _zero()) {
    return _stateVal('MOCKED');
  }
  if (
    module.brokenInteractions + module.absentInteractions >
      module.functioningInteractions + module.incompleteInteractions &&
    connected <= _one()
  ) {
    return _stateVal('BROKEN');
  }
  if (
    module.functioningInteractions >= Math.max(_three(), Math.round(total * 0.6)) &&
    failureLike <= Math.max(_two(), Math.round(total * 0.25)) &&
    connected > _zero()
  ) {
    return _stateVal('READY');
  }
  if (
    !_isComplexity(module.shellComplexity, 'light') &&
    module.persistedInteractions === _zero() &&
    module.backedDataSources === _zero() &&
    module.backendBoundInteractions === _zero()
  ) {
    return _stateVal('SHELL_ONLY');
  }
  return _stateVal('PARTIAL');
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
  if (_isState(state, 'SHELL_ONLY')) {
    pieces.push('rich frontend shell without persistence evidence');
  }
  if (_isState(state, 'MOCKED')) {
    pieces.push('facade/local-state signals dominate');
  }
  if (module.structuralTokens.length > _zero()) {
    pieces.push(`structural=${module.structuralTokens.slice(_zero(), _five()).join(', ')}`);
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
      pageCount: _zero(),
      totalInteractions: _zero(),
      functioningInteractions: _zero(),
      facadeInteractions: _zero(),
      brokenInteractions: _zero(),
      incompleteInteractions: _zero(),
      absentInteractions: _zero(),
      apiBoundInteractions: _zero(),
      backendBoundInteractions: _zero(),
      persistedInteractions: _zero(),
      totalDataSources: _zero(),
      backedDataSources: _zero(),
      semanticTokens: [],
      structuralTokens: [],
    };

    bucket.routeRoots = unique([...bucket.routeRoots, getRouteRoot(page.route, page.group)]);
    bucket.groups = unique([...bucket.groups, page.group]);
    bucket.userFacing = bucket.userFacing || isUserFacingGroup(page.group);
    bucket.pageCount += _one();
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
      _isComplexity(page.shellComplexity, 'rich') ||
      (_isComplexity(page.shellComplexity, 'medium') && _isComplexity(bucket.shellComplexity, 'light'))
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
