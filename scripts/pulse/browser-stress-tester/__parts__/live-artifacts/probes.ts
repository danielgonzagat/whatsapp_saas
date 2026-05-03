import type { BehaviorGraph } from '../../../types.behavior-graph';
import type { PulseProductGraph } from '../../../types.product-graph';
import type { PulseScopeState } from '../../../types.truth.scope';
import type {
  BrowserLiveArtifacts,
  BrowserPageDiscovery,
  BrowserRuntimeProbeTargets,
  ResolvedManifestOverlay,
  RouteCandidate,
} from './types';
import {
  PRODUCT_GRAPH_FILE,
  BEHAVIOR_GRAPH_FILE,
  SCOPE_STATE_FILE,
  RESOLVED_MANIFEST_FILE,
} from './types';
import {
  readArtifact,
  collectRouteCandidates,
  pickRouteByTokens,
  discoverAuthRoutes,
  normalizeRoute,
  routeSlugToPath,
  discoverPagePolicy,
  routeLooksPublic,
  routeLooksAuthRedirect,
} from './routes';
import { discoverStorageContract } from './storage';

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
  const productGraph = readArtifact<PulseProductGraph>(rootDir, PRODUCT_GRAPH_FILE);
  const behaviorGraph = readArtifact<BehaviorGraph>(rootDir, BEHAVIOR_GRAPH_FILE);
  const scopeState = readArtifact<PulseScopeState>(rootDir, SCOPE_STATE_FILE);
  const manifest = readArtifact<ResolvedManifestOverlay>(rootDir, RESOLVED_MANIFEST_FILE);
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
  const parent = [...pages.routePriority.entries()]
    .filter(([root]) => normalized.startsWith(`${root}/`))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return parent ? parent[1] + 1 : 1000;
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
  return route.split('/').some((segment) => segment.startsWith(':') || /^\[.+\]$/.test(segment));
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
    .filter((token) => token.length > 2);
  const productGraph = readArtifact<PulseProductGraph>(rootDir, PRODUCT_GRAPH_FILE);
  const routeCandidates = collectRouteCandidates(productGraph);
  const genericRoute = routeCandidates.find((candidate) =>
    probeTokens.every((token) => candidate.text.includes(token)),
  );
  if (genericRoute) {
    return `${backendUrl}${genericRoute.path}`;
  }
  return dbSource || 'database';
}
