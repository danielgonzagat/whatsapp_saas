/** Module-level semantic analysis helpers for codebase-truth. */

import type {
  PulseManifest,
  PulseModuleState,
  PulseShellComplexity,
  PulseTruthPageSummary,
} from './types';
import type { PageFunctionalMap } from './functional-map-types';
import {
  ROUTE_NOISE_TOKENS,
  addWeightedTokens,
  basenameWithoutExt,
  extractRootToken,
  normalizeText,
  orderTokens,
  singularize,
  slugify,
  titleCase,
  tokenize,
  unique,
} from './codebase-truth-tokens';

export interface ModuleAlias {
  key: string;
  name: string;
  tokens: string[];
}

export interface SemanticTokenProfile {
  orderedTokens: string[];
  structuralTokens: string[];
  rootTokens: string[];
  dominantRoot: string | null;
}

export interface ModuleBucket {
  key: string;
  name: string;
  routeRoots: string[];
  groups: string[];
  userFacing: boolean;
  shellComplexity: PulseShellComplexity;
  pageCount: number;
  totalInteractions: number;
  functioningInteractions: number;
  facadeInteractions: number;
  brokenInteractions: number;
  incompleteInteractions: number;
  absentInteractions: number;
  apiBoundInteractions: number;
  backendBoundInteractions: number;
  persistedInteractions: number;
  totalDataSources: number;
  backedDataSources: number;
  semanticTokens: string[];
  structuralTokens: string[];
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

  return {
    orderedTokens,
    structuralTokens,
    rootTokens,
    dominantRoot,
  };
}

function buildRouteTokens(route: string, group: string): string[] {
  const segments = route
    .split('/')
    .filter(Boolean)
    .filter((segment) => !segment.startsWith(':'))
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

export function getRouteRoot(route: string, group: string): string {
  const alias = buildGenericModuleAlias(route, group);
  if (!alias.key || alias.key === 'misc') {
    return group === 'public' ? '/' : group;
  }
  return alias.key;
}

export function determineShellComplexity(page: PageFunctionalMap): PulseShellComplexity {
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

export function classifyModuleState(module: ModuleBucket): PulseModuleState {
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
