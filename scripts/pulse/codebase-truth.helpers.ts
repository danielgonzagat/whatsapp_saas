// PULSE — Live Codebase Nervous System
// Codebase truth: token, semantic, and route helper functions

import type { PulseDiscoveredModule, PulseShellComplexity } from './types';
import type { PageFunctionalMap } from './functional-map-types';

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

export interface ModuleBucket extends Omit<
  PulseDiscoveredModule,
  'declaredModule' | 'state' | 'notes'
> {
  semanticTokens: string[];
  structuralTokens: string[];
}

export const ROUTE_NOISE_TOKENS = new Set([
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

export const SEMANTIC_NOISE_TOKENS = new Set([
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
  if (value.endsWith('ies') && value.length > 3) return `${value.slice(0, -3)}y`;
  if (value.endsWith('ses') || value.endsWith('ss')) return value;
  if (value.endsWith('s') && value.length > 3) return value.slice(0, -1);
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

function shouldIgnoreSemanticToken(token: string): boolean {
  return !token || SEMANTIC_NOISE_TOKENS.has(token) || token.length < 2 || !/[a-z]/.test(token);
}

function addWeightedTokens(
  scores: Map<string, number>,
  value: string | null | undefined,
  weight: number,
) {
  if (!value || weight <= 0) return;
  for (const baseToken of tokenize(value)) {
    const variants = unique([baseToken, singularize(baseToken)]).filter(Boolean);
    for (const token of variants) {
      if (shouldIgnoreSemanticToken(token)) continue;
      scores.set(token, (scores.get(token) || 0) + weight);
    }
  }
}

function orderTokens(scores: Map<string, number>): string[] {
  return [...scores.entries()]
    .sort((left, right) =>
      right[1] !== left[1] ? right[1] - left[1] : left[0].localeCompare(right[0]),
    )
    .map(([token]) => token);
}

function basenameWithoutExt(filePath: string): string {
  const fileName = filePath.split('/').pop() || filePath;
  return fileName.replace(/\.[^.]+$/u, '');
}

function extractRootToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const rawSegments = String(value)
    .split('/')
    .flatMap((segment) => tokenize(segment))
    .flatMap((segment) => [segment, singularize(segment)]);
  return rawSegments.find((token) => !shouldIgnoreSemanticToken(token)) || null;
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
  const orderedRootEntries = [...rootScores.entries()].sort((left, right) =>
    right[1] !== left[1] ? right[1] - left[1] : left[0].localeCompare(right[0]),
  );
  const rootTokens = orderedRootEntries.map(([token]) => token);
  const [topRoot, secondRoot] = orderedRootEntries;
  const dominantRoot =
    topRoot && (!secondRoot || topRoot[1] >= secondRoot[1] + 2 || topRoot[1] >= secondRoot[1] * 1.5)
      ? topRoot[0]
      : null;

  return { orderedTokens, structuralTokens, rootTokens, dominantRoot };
}

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
  if (group === 'e2e') return { key: 'e2e', name: 'E2E', tokens: ['e2e'] };
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
  if (!alias.key || alias.key === 'misc') return group === 'public' ? '/' : group;
  return alias.key;
}

export function determineShellComplexity(page: PageFunctionalMap): PulseShellComplexity {
  if (
    page.componentFiles.length >= 8 ||
    page.totalInteractions >= 15 ||
    (page.componentFiles.length >= 5 && page.dataSources.length >= 2)
  )
    return 'rich';
  if (
    page.componentFiles.length >= 4 ||
    page.totalInteractions >= 6 ||
    page.dataSources.length >= 1
  )
    return 'medium';
  return 'light';
}
