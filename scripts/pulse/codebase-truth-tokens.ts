/** String utility functions and noise-token constants for codebase-truth analysis. */

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
  'type',
  'types',
  'config',
  'service',
  'services',
  'controller',
  'controllers',
  'repository',
  'repositories',
  'dto',
  'dtos',
  'guard',
  'guards',
  'interceptor',
  'interceptors',
  'middleware',
  'decorator',
  'decorators',
  'filter',
  'filters',
  'pipe',
  'pipes',
  'entity',
  'entities',
  'model',
  'models',
  'schema',
  'schemas',
  'interface',
  'interfaces',
  'constant',
  'constants',
  'enum',
  'enums',
  'event',
  'events',
  'handler',
  'handlers',
  'listener',
  'listeners',
  'subscriber',
  'subscribers',
  'publisher',
  'publishers',
  'queue',
  'queues',
  'job',
  'jobs',
  'worker',
  'workers',
  'task',
  'tasks',
  'cron',
  'crons',
  'scheduler',
  'schedulers',
]);

export function normalizeText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

export function shouldIgnoreSemanticToken(token: string): boolean {
  return !token || SEMANTIC_NOISE_TOKENS.has(token) || token.length < 2 || !/[a-z]/.test(token);
}

export function addWeightedTokens(
  scores: Map<string, number>,
  value: string | null | undefined,
  weight: number,
): void {
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

export function orderTokens(scores: Map<string, number>): string[] {
  return [...scores.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([token]) => token);
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
