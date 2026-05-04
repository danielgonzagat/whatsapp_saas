import { pathExists, readJsonFile } from '../../../safe-fs';
import { safeJoin } from '../../../safe-path';
import type {
  BrowserAuthRoutes,
  BrowserPageDiscovery,
  ResolvedManifestOverlay,
  RouteCandidate,
} from './types';

function resolveArtifactPath(rootDir: string, fileName: string): string | null {
  const candidates = [
    safeJoin(rootDir, '.pulse', 'current', fileName),
    safeJoin(rootDir, fileName),
  ];
  return candidates.find((candidate) => pathExists(candidate)) || null;
}

export function readArtifact<T>(rootDir: string, fileName: string): T | null {
  const artifactPath = resolveArtifactPath(rootDir, fileName);
  if (!artifactPath) {
    return null;
  }
  try {
    return readJsonFile<T>(artifactPath);
  } catch {
    return null;
  }
}

export function normalizeRoute(route: string): string | null {
  const trimmed = route.trim();
  if (!trimmed) {
    return null;
  }
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}

export function routeSlugToPath(slug: string): string | null {
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
  return normalizeRoute(pathSegments.join('/'));
}

export function routeCandidateFromArtifactId(artifactId: string): RouteCandidate | null {
  const parts = artifactId.split(':');
  const methodIndex = parts.findIndex((part) => /^(GET|POST|PUT|PATCH|DELETE)$/i.test(part));
  if (methodIndex < 0 || methodIndex + 1 >= parts.length) {
    return null;
  }
  const pathFromSlug = routeSlugToPath(parts.slice(methodIndex + 1).join(':'));
  if (!pathFromSlug) {
    return null;
  }
  const prefix = parts[0] || '';
  const sourceRank = prefix === 'route' ? 0 : prefix === 'proxy' ? 1 : 2;
  return {
    path: pathFromSlug,
    method: parts[methodIndex].toUpperCase(),
    sourceRank,
    text: artifactId.toLowerCase(),
  };
}

export function collectRouteCandidates(
  productGraph: {
    surfaces?: Array<{ artifactIds?: string[] }>;
    capabilities?: Array<{ artifactIds?: string[] }>;
    flows?: Array<{ capabilities?: string[] }>;
  } | null,
): RouteCandidate[] {
  if (!productGraph) {
    return [];
  }
  const artifactIds = new Set<string>();
  for (const surface of productGraph.surfaces || []) {
    for (const artifactId of surface.artifactIds || []) {
      artifactIds.add(artifactId);
    }
  }
  for (const capability of productGraph.capabilities || []) {
    for (const artifactId of capability.artifactIds || []) {
      artifactIds.add(artifactId);
    }
  }
  for (const flow of productGraph.flows || []) {
    for (const capabilityId of flow.capabilities || []) {
      artifactIds.add(capabilityId);
    }
  }
  return [...artifactIds]
    .map(routeCandidateFromArtifactId)
    .filter((candidate): candidate is RouteCandidate => candidate !== null);
}

export function pickRouteByTokens(
  candidates: RouteCandidate[],
  requiredTokens: string[],
  method?: string,
): string | null {
  const lowered = requiredTokens.map((token) => token.toLowerCase());
  const matches = candidates
    .filter((candidate) => !method || candidate.method === method)
    .filter((candidate) => lowered.every((token) => candidate.text.includes(token)))
    .sort((a, b) => a.sourceRank - b.sourceRank || a.path.length - b.path.length);
  return matches[0]?.path || null;
}

export function discoverAuthRoutes(candidates: RouteCandidate[]): BrowserAuthRoutes {
  return {
    loginPath: pickRouteByTokens(candidates, ['auth', 'login'], 'POST'),
    registerPath: pickRouteByTokens(candidates, ['auth', 'register'], 'POST'),
  };
}

export function routeLooksPublic(route: string): boolean {
  const segments = route.split('/').filter(Boolean);
  if (segments.length === 0) {
    return true;
  }
  return segments.some((segment) =>
    /^(login|register|terms|privacy|onboarding|reset|verify|public|pricing)$/i.test(segment),
  );
}

export function routeLooksAuthRedirect(route: string): boolean {
  return route.split('/').some((segment) => /^(login|signin|entrar|auth)$/i.test(segment));
}

export function discoverPagePolicy(manifest: ResolvedManifestOverlay | null): BrowserPageDiscovery {
  const publicRoutes = new Set<string>();
  const loginRedirectRoutes = new Set<string>();
  const authenticatedRoutes = new Set<string>();
  const routePriority = new Map<string, number>();

  const modules = manifest?.modules || [];
  for (const [index, moduleEntry] of modules.entries()) {
    for (const root of moduleEntry.routeRoots || []) {
      const route = normalizeRoute(root);
      if (!route) {
        continue;
      }
      if (routeLooksPublic(route) || routeLooksAuthRedirect(route)) {
        publicRoutes.add(route);
      } else if (moduleEntry.userFacing) {
        authenticatedRoutes.add(route);
      }
      if (routeLooksAuthRedirect(route)) {
        loginRedirectRoutes.add(route);
      }
      const stateBias =
        moduleEntry.state === 'READY' ? 0 : moduleEntry.state === 'PARTIAL' ? 20 : 40;
      const criticalBias = moduleEntry.critical ? 0 : 10;
      routePriority.set(route, index + stateBias + criticalBias + 1);
    }
  }

  return {
    publicRoutes,
    loginRedirectRoutes,
    authenticatedRoutes,
    routePriority,
  };
}
