import type { PulseProductGraph } from '../../../types.product-graph';
import type { BehaviorGraph } from '../../../types.behavior-graph';
import type { PulseScopeState } from '../../../types.truth.scope';
import {
  deriveUnitValue,
  discoverAllObservedArtifactFilenames,
  discoverRouteSeparatorFromRuntime,
} from '../../../dynamic-reality-kernel';
import type {
  BrowserAuthRoutes,
  BrowserLiveArtifacts,
  BrowserPageDiscovery,
  BrowserRuntimeProbeTargets,
} from './types';
import type { ResolvedManifestOverlay, RouteCandidate } from './types';
import {
  readArtifact,
  collectRouteCandidates,
  discoverAuthRoutes,
  normalizeRoute,
  routeLooksPublic,
  routeLooksAuthRedirect,
  discoverPagePolicy,
  pickRouteByTokens,
  routeCandidateFromArtifactId,
} from './discovery';
import { discoverStorageContract } from './storage';

function routeSlugToPath(slug: string): string | null {
  const pathSegments: string[] = [];
  for (const token of slug.split('-').filter(Boolean)) {
    if (token === 'id') {
      const previous = pathSegments.pop();
      const parameterBase = previous?.startsWith(':') ? previous.slice(1) : previous;
      pathSegments.push(`:${parameterBase ? `${parameterBase}Id` : token}`);
      continue;
    }
    pathSegments.push(token);
  }
  return normalizeRoute(pathSegments.join(discoverRouteSeparatorFromRuntime()));
}

function discoverRuntimeProbeTargets(
  candidates: RouteCandidate[],
  behaviorGraph: BehaviorGraph | null,
): BrowserRuntimeProbeTargets {
  const backendRoutes = new Map<string, string>();
  const healthRoute = pickRouteByTokens(candidates, ['health'], 'GET');
  if (healthRoute) {
    backendRoutes.set('backend-health', healthRoute);
  } else {
    const healthNode = (behaviorGraph?.nodes || []).find(
      (node) => node.kind === 'api_endpoint' && /health/i.test(`${node.name} ${node.filePath}`),
    );
    const nodeRoute = healthNode ? routeSlugToPath(healthNode.name) : null;
    if (nodeRoute) {
      backendRoutes.set('backend-health', nodeRoute);
    }
  }

  const authRoute = pickRouteByTokens(candidates, ['auth', 'login'], 'POST');
  if (authRoute) {
    backendRoutes.set('auth-session', authRoute);
  }

  return { backendRoutes };
}

export function discoverBrowserLiveArtifacts(
  rootDir: string = process.cwd(),
): BrowserLiveArtifacts {
  const artifacts = discoverAllObservedArtifactFilenames();
  const productGraph = readArtifact<PulseProductGraph>(rootDir, artifacts.productGraph);
  const behaviorGraph = readArtifact<BehaviorGraph>(rootDir, artifacts.behaviorGraph);
  const scopeState = readArtifact<PulseScopeState>(rootDir, artifacts.scopeState);
  const manifest = readArtifact<ResolvedManifestOverlay>(rootDir, artifacts.resolvedManifest);
  const routeCandidates = collectRouteCandidates(productGraph);

  return {
    authRoutes: discoverAuthRoutes(routeCandidates),
    storage: discoverStorageContract(rootDir, scopeState, productGraph),
    pages: discoverPagePolicy(manifest),
    probes: discoverRuntimeProbeTargets(routeCandidates, behaviorGraph),
  };
}

export function getPagePriorityFromArtifacts(route: string, pages: BrowserPageDiscovery): number {
  const normalized = normalizeRoute(route) || route;
  const exact = pages.routePriority.get(normalized);
  if (exact !== undefined) {
    return exact;
  }
  const sep = discoverRouteSeparatorFromRuntime();
  const parent = [...pages.routePriority.entries()]
    .filter(([root]) => normalized.startsWith(`${root}${sep}`))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return parent ? parent[deriveUnitValue()] + deriveUnitValue() : 1000;
}

export function isPublicRouteFromArtifacts(route: string, pages: BrowserPageDiscovery): boolean {
  const normalized = normalizeRoute(route) || route;
  if (pages.publicRoutes.has(normalized)) {
    return true;
  }
  return routeLooksPublic(normalized);
}

export function isLoginRedirectFromArtifacts(url: string, pages: BrowserPageDiscovery): boolean {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  const normalized = normalizeRoute(pathname) || pathname;
  if (pages.loginRedirectRoutes.has(normalized)) {
    return true;
  }
  return routeLooksAuthRedirect(normalized);
}

export function hasUnresolvedDynamicSegment(route: string): boolean {
  const sep = discoverRouteSeparatorFromRuntime();
  return route
    .split(sep)
    .some(
      (segment) => segment.startsWith(':') || (segment.startsWith('[') && segment.endsWith(']')),
    );
}

export function resolveRuntimeProbeTargetFromArtifacts(
  probeId: string,
  backendUrl: string,
  frontendUrl: string,
  dbSource: string | undefined,
  rootDir: string = process.cwd(),
): string {
  if (probeId === 'frontend-reachability') {
    return frontendUrl;
  }
  const artifacts = discoverBrowserLiveArtifacts(rootDir);
  const backendRoute = artifacts.probes.backendRoutes.get(probeId);
  if (backendRoute) {
    return `${backendUrl}${backendRoute}`;
  }
  const probeTokens = probeId
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > deriveUnitValue() + deriveUnitValue());
  const artifactFilenames = discoverAllObservedArtifactFilenames();
  const productGraph = readArtifact<PulseProductGraph>(rootDir, artifactFilenames.productGraph);
  const routeCandidates = collectRouteCandidates(productGraph);
  const genericRoute = routeCandidates.find((candidate) =>
    probeTokens.every((token) => candidate.text.includes(token)),
  );
  if (genericRoute) {
    return `${backendUrl}${genericRoute.path}`;
  }
  return dbSource || 'database';
}
