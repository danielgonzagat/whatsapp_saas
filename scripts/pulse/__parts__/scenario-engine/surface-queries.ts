import { isObservedHttpEntrypointMethod } from '../../dynamic-reality-grammar';
import type { PulseProductSurface } from '../../types';
import type { BehaviorGraph, BehaviorNode } from '../../types.behavior-graph';
import { tokenizeScenarioText } from './token-selector-utils';

function tokenizeSurface(surface: PulseProductSurface): string[] {
  const raw = [surface.id, surface.name, ...surface.artifactIds, ...surface.capabilities].join(' ');
  return [...new Set(tokenizeScenarioText(raw).filter((token) => !isSurfaceHintNoiseToken(token)))];
}

function isSurfaceHintNoiseToken(token: string): boolean {
  return (
    token.length <= 2 ||
    [
      'api',
      'app',
      'backend',
      'component',
      'components',
      'controller',
      'controllers',
      'frontend',
      'lib',
      'page',
      'pages',
      'route',
      'routes',
      'service',
      'services',
      'src',
      'ts',
      'tsx',
      'js',
      'jsx',
    ].includes(token) ||
    isObservedHttpEntrypointMethod(token)
  );
}

function nodeMatchesSurface(node: BehaviorNode, surface: PulseProductSurface): boolean {
  const hints = tokenizeSurface(surface);
  if (hints.length === 0) return false;
  const lower = node.filePath.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

function getEndpointsForSurface(
  behaviorGraph: BehaviorGraph | null,
  surface: PulseProductSurface,
): BehaviorNode[] {
  if (!behaviorGraph) return [];
  return behaviorGraph.nodes.filter(
    (n) =>
      n.kind === 'api_endpoint' &&
      nodeMatchesSurface(n, surface) &&
      n.decorators.some(isObservedHttpEntrypointMethod),
  );
}

function getHttpDecorator(node: BehaviorNode): string {
  for (const d of node.decorators) {
    if (isObservedHttpEntrypointMethod(d)) {
      return d.toUpperCase();
    }
  }
  return 'GET';
}

function extractRoutePattern(node: BehaviorNode): string {
  const segments = node.filePath.split('/').filter(Boolean);
  const backendIndex = segments.indexOf('backend');
  const srcIndex = segments.indexOf('src');
  const controllerIndex = segments.findIndex((segment) => segment.endsWith('.controller.ts'));
  if (backendIndex >= 0 && srcIndex === backendIndex + 1 && controllerIndex > srcIndex + 1) {
    const segment = segments[srcIndex + 1];
    return `/api/${segment}`;
  }
  return '/api/';
}

export {
  tokenizeSurface,
  isSurfaceHintNoiseToken,
  nodeMatchesSurface,
  getEndpointsForSurface,
  getHttpDecorator,
  extractRoutePattern,
};
