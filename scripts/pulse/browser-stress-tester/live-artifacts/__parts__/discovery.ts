import { pathExists, readJsonFile, readTextFile } from '../../../safe-fs';
import { safeJoin } from '../../../safe-path';
import type { PulseProductGraph } from '../../../types.product-graph';
import {
  deriveZeroValue,
  deriveUnitValue,
  discoverRouteSeparatorFromRuntime,
  observeStatusTextLengthFromCatalog,
} from '../../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { deriveHttpStatusFromObservedCatalog } from '../../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import type { RouteCandidate, BrowserAuthRoutes, BrowserPageDiscovery } from './types';
import type { ResolvedManifestOverlay } from './types';

export function resolveArtifactPath(rootDir: string, fileName: string): string | null {
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
  const sep = discoverRouteSeparatorFromRuntime();
  const trimmed = route.trim();
  if (!trimmed) {
    return null;
  }
  const withSlash = trimmed.startsWith(sep) ? trimmed : `${sep}${trimmed}`;
  let normalized = withSlash;
  while (normalized.includes(sep + sep)) {
    normalized = normalized.split(sep + sep).join(sep);
  }
  if (normalized.endsWith(sep) && normalized !== sep) {
    normalized = normalized.slice(0, -sep.length);
  }
  return normalized || sep;
}

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

export function routeCandidateFromArtifactId(artifactId: string): RouteCandidate | null {
  const parts = artifactId.split(':');
  const methodIndex = parts.findIndex((part) => /^(GET|POST|PUT|PATCH|DELETE)$/i.test(part));
  if (methodIndex < deriveZeroValue() || methodIndex + deriveUnitValue() >= parts.length) {
    return null;
  }
  const pathFromSlug = routeSlugToPath(parts.slice(methodIndex + 1).join(':'));
  if (!pathFromSlug) {
    return null;
  }
  const prefix = parts[0] || '';
  const sourceRank =
    prefix === 'route'
      ? deriveZeroValue()
      : prefix === 'proxy'
        ? deriveUnitValue()
        : deriveUnitValue() + deriveUnitValue();
  return {
    path: pathFromSlug,
    method: parts[methodIndex].toUpperCase(),
    sourceRank,
    text: artifactId.toLowerCase(),
  };
}

export function collectRouteCandidates(productGraph: PulseProductGraph | null): RouteCandidate[] {
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
  const sep = discoverRouteSeparatorFromRuntime();
  const segments = route.split(sep).filter(Boolean);
  if (segments.length === deriveZeroValue()) {
    return true;
  }
  return segments.some((segment) =>
    /^(login|register|terms|privacy|onboarding|reset|verify|public|pricing)$/i.test(segment),
  );
}

export function routeLooksAuthRedirect(route: string): boolean {
  const sep = discoverRouteSeparatorFromRuntime();
  return route.split(sep).some((segment) => /^(login|signin|entrar|auth)$/i.test(segment));
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
      const statusTextLen = observeStatusTextLengthFromCatalog(
        deriveHttpStatusFromObservedCatalog('Unprocessable Entity'),
      );
      const stateBias =
        moduleEntry.state === 'READY'
          ? deriveZeroValue()
          : moduleEntry.state === 'PARTIAL'
            ? statusTextLen
            : statusTextLen + statusTextLen;
      const criticalBias = moduleEntry.critical
        ? deriveZeroValue()
        : observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden')) +
          deriveUnitValue();
      routePriority.set(route, index + stateBias + criticalBias + deriveUnitValue());
    }
  }

  return {
    publicRoutes,
    loginRedirectRoutes,
    authenticatedRoutes,
    routePriority,
  };
}
