import type {
  PulseDiscoveredModule,
  PulseManifest,
  PulseModuleState,
  PulseShellComplexity,
  PulseTruthPageSummary,
} from '../../types';
import type { PageFunctionalMap } from '../../functional-map-types';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverShellComplexityLabels,
  discoverModuleStateLabels,
} from '../../dynamic-reality-kernel';
import {
  normalizeText,
  tokenize,
  slugify,
  unique,
  titleCase,
  singularize,
  getRouteSegments,
  buildPageSemanticProfile,
} from '../../codebase-truth.analysis';

export interface ModuleAlias {
  key: string;
  name: string;
  tokens: string[];
}

export interface ModuleBucket extends Omit<
  PulseDiscoveredModule,
  'declaredModule' | 'state' | 'notes'
> {
  semanticTokens: string[];
  structuralTokens: string[];
}

function _isState(v: string, label: string): boolean {
  return discoverModuleStateLabels().has(v) && v === label;
}

function _stateVal(label: string): PulseModuleState {
  if (discoverModuleStateLabels().has(label)) return label as PulseModuleState;
  throw new Error(`Invalid module state: ${label}`);
}

export function _isComplexity(v: string, label: string): boolean {
  return discoverShellComplexityLabels().has(v) && v === label;
}

function _complexityVal(label: string): PulseShellComplexity {
  if (discoverShellComplexityLabels().has(label)) return label as PulseShellComplexity;
  throw new Error(`Invalid shell complexity: ${label}`);
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

export function buildGenericModuleAlias(
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
    routeTokens[deriveZeroValue()] ||
    rootTokens[deriveZeroValue()] ||
    structuralTokens[deriveZeroValue()] ||
    semanticTokens[deriveZeroValue()] ||
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

export function getRouteRoot(route: string, group: string): string {
  const alias = buildGenericModuleAlias(route, group);
  if (!alias.key || alias.key === 'misc') {
    return group === 'public' ? '/' : group;
  }
  return alias.key;
}

function determineShellComplexity(page: PageFunctionalMap): PulseShellComplexity {
  if (
    page.componentFiles.length >=
      deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() ||
    page.totalInteractions >=
      deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() ||
    (page.componentFiles.length >=
      deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() &&
      page.dataSources.length >= deriveUnitValue() + deriveUnitValue())
  ) {
    return _complexityVal('rich');
  }
  if (
    page.componentFiles.length >=
      deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() ||
    page.totalInteractions >=
      deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() ||
    page.dataSources.length >= deriveUnitValue()
  ) {
    return _complexityVal('medium');
  }
  return _complexityVal('light');
}

export function buildPageSummary(page: PageFunctionalMap): PulseTruthPageSummary {
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
    (item) => item.prismaModels.length > deriveZeroValue(),
  ).length;
  const backedDataSources = page.dataSources.filter((item) => item.hasBackendRoute).length;

  return {
    route: page.route,
    group: page.group,
    moduleKey: moduleAlias.key,
    moduleName: moduleAlias.name,
    shellComplexity: determineShellComplexity(page),
    totalInteractions: page.totalInteractions,
    functioningInteractions: page.counts.FUNCIONA || deriveZeroValue(),
    facadeInteractions: page.counts.FACHADA || deriveZeroValue(),
    brokenInteractions: page.counts.QUEBRADO || deriveZeroValue(),
    incompleteInteractions: page.counts.INCOMPLETO || deriveZeroValue(),
    absentInteractions: page.counts.AUSENTE || deriveZeroValue(),
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

export function matchDeclaredModule(
  module: ModuleBucket,
  manifest: PulseManifest | null,
): string | null {
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
      (exactName
        ? (deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue()) *
          (deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue())
        : deriveZeroValue()) +
      (entryTokens.includes(module.key)
        ? deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue()
        : deriveZeroValue()) +
      scoreDeclaredMatch(candidateTokens, entryTokens);
    if (score > (best?.score || deriveZeroValue())) {
      best = { name: entry.name, score };
    }
  }
  return best &&
    best.score >=
      deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue()
    ? best.name
    : null;
}

export function classifyModuleState(module: ModuleBucket): PulseModuleState {
  if (!module.userFacing) {
    return _stateVal('INTERNAL');
  }
  const total = Math.max(deriveUnitValue(), module.totalInteractions);
  const failureLike =
    module.facadeInteractions + module.brokenInteractions + module.absentInteractions;
  const connected =
    module.backendBoundInteractions + module.backedDataSources + module.persistedInteractions;

  if (_isComplexity(module.shellComplexity, 'rich') && connected === deriveZeroValue()) {
    return _stateVal('SHELL_ONLY');
  }
  if (
    module.facadeInteractions > Math.max(module.functioningInteractions, deriveZeroValue()) &&
    connected === deriveZeroValue()
  ) {
    return _stateVal('MOCKED');
  }
  if (
    module.brokenInteractions + module.absentInteractions >
      module.functioningInteractions + module.incompleteInteractions &&
    connected <= deriveUnitValue()
  ) {
    return _stateVal('BROKEN');
  }
  if (
    module.functioningInteractions >=
      Math.max(
        deriveUnitValue() + deriveUnitValue() + deriveUnitValue(),
        Math.round(total * 0.6),
      ) &&
    failureLike <= Math.max(deriveUnitValue() + deriveUnitValue(), Math.round(total * 0.25)) &&
    connected > deriveZeroValue()
  ) {
    return _stateVal('READY');
  }
  if (
    !_isComplexity(module.shellComplexity, 'light') &&
    module.persistedInteractions === deriveZeroValue() &&
    module.backedDataSources === deriveZeroValue() &&
    module.backendBoundInteractions === deriveZeroValue()
  ) {
    return _stateVal('SHELL_ONLY');
  }
  return _stateVal('PARTIAL');
}

export function summarizeModule(
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
  if (module.structuralTokens.length > deriveZeroValue()) {
    pieces.push(
      `structural=${module.structuralTokens.slice(deriveZeroValue(), deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()).join(', ')}`,
    );
  }
  return pieces.join(', ');
}
