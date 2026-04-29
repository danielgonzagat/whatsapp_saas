import { pathExists, readJsonFile, readTextFile } from '../safe-fs';
import { safeJoin } from '../safe-path';
import type { PulseProductGraph } from '../types.product-graph';
import type { BehaviorGraph } from '../types.behavior-graph';
import type { PulseScopeFile, PulseScopeState } from '../types.truth.scope';

const PRODUCT_GRAPH_FILE = 'PULSE_PRODUCT_GRAPH.json';
const BEHAVIOR_GRAPH_FILE = 'PULSE_BEHAVIOR_GRAPH.json';
const SCOPE_STATE_FILE = 'PULSE_SCOPE_STATE.json';
const RESOLVED_MANIFEST_FILE = 'PULSE_RESOLVED_MANIFEST.json';
const STORAGE_KEY_RE =
  /(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|getItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g;
const STORAGE_CONST_RE =
  /(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|getItem|removeItem)\s*\(\s*([A-Z][A-Z0-9_]*)/g;
const COOKIE_GET_RE = /cookies\s*\.\s*get\s*\(\s*['"`]([^'"`]+)['"`]/g;
const DOCUMENT_COOKIE_RE = /document\s*\.\s*cookie\s*=\s*['"`]([^=;'"`]+)=/g;
const CONST_LITERAL_RE = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*['"`]([^'"`]+)['"`]/g;
const CONST_JOIN_RE =
  /const\s+([A-Z][A-Z0-9_]*)\s*=\s*\[([^\]]+)\]\.join\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

export interface BrowserAuthRoutes {
  loginPath: string | null;
  registerPath: string | null;
}

export interface BrowserAuthStorageContract {
  tokenStorageKeys: string[];
  workspaceStorageKeys: string[];
  onboardingStorageKeys: string[];
  authCookieNames: string[];
}

export interface BrowserPageDiscovery {
  publicRoutes: Set<string>;
  loginRedirectRoutes: Set<string>;
  authenticatedRoutes: Set<string>;
  routePriority: Map<string, number>;
}

export interface BrowserRuntimeProbeTargets {
  backendRoutes: Map<string, string>;
}

export interface BrowserLiveArtifacts {
  authRoutes: BrowserAuthRoutes;
  storage: BrowserAuthStorageContract;
  pages: BrowserPageDiscovery;
  probes: BrowserRuntimeProbeTargets;
}

interface ManifestModule {
  key?: string;
  routeRoots?: string[];
  groups?: string[];
  userFacing?: boolean;
  critical?: boolean;
  state?: string;
  pageCount?: number;
}

interface ResolvedManifestOverlay {
  modules?: ManifestModule[];
}

interface RouteCandidate {
  path: string;
  method: string;
  sourceRank: number;
  text: string;
}

function resolveArtifactPath(rootDir: string, fileName: string): string | null {
  const candidates = [
    safeJoin(rootDir, '.pulse', 'current', fileName),
    safeJoin(rootDir, fileName),
  ];
  return candidates.find((candidate) => pathExists(candidate)) || null;
}

function readArtifact<T>(rootDir: string, fileName: string): T | null {
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

function normalizeRoute(route: string): string | null {
  const trimmed = route.trim();
  if (!trimmed) {
    return null;
  }
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}

function routeSlugToPath(slug: string): string | null {
  const route = slug
    .replace(/-workspace-id\b/g, '/:workspaceId')
    .replace(/-product-id\b/g, '/:productId')
    .replace(/-conversation-id\b/g, '/:conversationId')
    .replace(/-flow-id\b/g, '/:flowId')
    .replace(/-transaction-id\b/g, '/:transactionId')
    .replace(/-key-id\b/g, '/:keyId')
    .replace(/-id\b/g, '/:id')
    .replace(/-/g, '/');
  return normalizeRoute(route);
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

function collectRouteCandidates(productGraph: PulseProductGraph | null): RouteCandidate[] {
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

function pickRouteByTokens(
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

function discoverAuthRoutes(candidates: RouteCandidate[]): BrowserAuthRoutes {
  return {
    loginPath: pickRouteByTokens(candidates, ['auth', 'login'], 'POST'),
    registerPath: pickRouteByTokens(candidates, ['auth', 'register'], 'POST'),
  };
}

function routeLooksPublic(route: string): boolean {
  const segments = route.split('/').filter(Boolean);
  if (segments.length === 0) {
    return true;
  }
  return segments.some((segment) =>
    /^(login|register|terms|privacy|onboarding|reset|verify|public|pricing)$/i.test(segment),
  );
}

function routeLooksAuthRedirect(route: string): boolean {
  return route.split('/').some((segment) => /^(login|signin|entrar|auth)$/i.test(segment));
}

function discoverPagePolicy(manifest: ResolvedManifestOverlay | null): BrowserPageDiscovery {
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

function addStorageKey(contract: BrowserAuthStorageContract, key: string): void {
  const normalized = key.trim();
  if (!normalized) {
    return;
  }
  if (/guest|claim/i.test(normalized)) {
    return;
  }
  if (/workspace/i.test(normalized)) {
    contract.workspaceStorageKeys.push(normalized);
    return;
  }
  if (/onboarding/i.test(normalized)) {
    contract.onboardingStorageKeys.push(normalized);
    return;
  }
  if (/(token|jwt|session|access)/i.test(normalized)) {
    contract.tokenStorageKeys.push(normalized);
  }
}

function addCookieName(contract: BrowserAuthStorageContract, name: string): void {
  const normalized = name.trim();
  if (/(token|auth|session|jwt)/i.test(normalized)) {
    contract.authCookieNames.push(normalized);
  }
}

function discoverStringConstants(content: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const match of content.matchAll(CONST_LITERAL_RE)) {
    constants.set(match[1], match[2]);
  }
  for (const match of content.matchAll(CONST_JOIN_RE)) {
    const values = [...match[2].matchAll(/['"`]([^'"`]+)['"`]/g)].map(
      (valueMatch) => valueMatch[1],
    );
    if (values.length > 0) {
      constants.set(match[1], values.join(match[3]));
    }
  }
  return constants;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function getScopeRelativePath(file: unknown): string | null {
  if (!file || typeof file !== 'object') {
    return null;
  }
  const entry = file as Record<string, unknown>;
  const value = entry.path || entry.relativePath;
  return typeof value === 'string' && value ? value : null;
}

function isScopeSourceFile(file: unknown): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const entry = file as Record<string, unknown>;
  return entry.kind === 'source' || entry.isSource === true;
}

function isFrontendScopeFile(file: unknown, relativePath: string): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const entry = file as Record<string, unknown>;
  return (
    entry.surface === 'frontend' ||
    entry.surface === 'frontend-admin' ||
    relativePath.startsWith('frontend/') ||
    relativePath.startsWith('frontend-admin/')
  );
}

function isLikelyAuthStorageFile(file: unknown, relativePath: string): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const entry = file as Record<string, unknown>;
  return entry.userFacing === true || /auth|middleware|token|session/i.test(relativePath);
}

function artifactIdToLikelySourcePath(artifactId: string): string | null {
  const sourceSlug = artifactId.split(':')[1];
  if (!sourceSlug?.startsWith('frontend-')) {
    return null;
  }
  const extensionMatch = sourceSlug.match(/-(tsx|ts|jsx|js|mjs|cjs)$/);
  if (!extensionMatch) {
    return null;
  }
  const extension = extensionMatch[1];
  const withoutExtension = sourceSlug.slice(0, -extension.length - 1);
  return `${withoutExtension.replace(/-/g, '/')}.${extension}`;
}

function collectAuthArtifactSourceFiles(productGraph: PulseProductGraph | null): string[] {
  if (!productGraph) {
    return [];
  }
  const artifactIds = new Set<string>();
  for (const surface of productGraph.surfaces || []) {
    const text = `${surface.id} ${surface.name}`.toLowerCase();
    if (text.includes('auth') || text.includes('identity')) {
      for (const artifactId of surface.artifactIds || []) {
        artifactIds.add(artifactId);
      }
    }
  }
  return [...artifactIds]
    .map(artifactIdToLikelySourcePath)
    .filter((sourcePath): sourcePath is string => sourcePath !== null);
}

function discoverStorageContract(
  rootDir: string,
  scopeState: PulseScopeState | null,
  productGraph: PulseProductGraph | null,
): BrowserAuthStorageContract {
  const contract: BrowserAuthStorageContract = {
    tokenStorageKeys: [],
    workspaceStorageKeys: [],
    onboardingStorageKeys: [],
    authCookieNames: [],
  };

  const candidateFiles = unique([
    ...(scopeState?.files || [])
      .map((file) => ({ file, relativePath: getScopeRelativePath(file) }))
      .filter(
        (entry): entry is { file: PulseScopeFile; relativePath: string } =>
          entry.relativePath !== null,
      )
      .filter(({ file }) => isScopeSourceFile(file))
      .filter(({ file, relativePath }) => isFrontendScopeFile(file, relativePath))
      .filter(({ file, relativePath }) => isLikelyAuthStorageFile(file, relativePath))
      .map((entry) => entry.relativePath),
    ...collectAuthArtifactSourceFiles(productGraph),
  ]);

  for (const relativePath of candidateFiles) {
    const filePath = safeJoin(rootDir, relativePath);
    if (!pathExists(filePath)) {
      continue;
    }
    let content = '';
    try {
      content = readTextFile(filePath, 'utf8');
    } catch {
      continue;
    }
    for (const match of content.matchAll(STORAGE_KEY_RE)) {
      addStorageKey(contract, match[1]);
    }
    const constants = discoverStringConstants(content);
    for (const match of content.matchAll(STORAGE_CONST_RE)) {
      const resolved = constants.get(match[1]);
      if (resolved) {
        addStorageKey(contract, resolved);
      }
    }
    for (const match of content.matchAll(COOKIE_GET_RE)) {
      addCookieName(contract, match[1]);
    }
    for (const match of content.matchAll(DOCUMENT_COOKIE_RE)) {
      addCookieName(contract, match[1]);
    }
  }

  return {
    tokenStorageKeys: unique(contract.tokenStorageKeys),
    workspaceStorageKeys: unique(contract.workspaceStorageKeys),
    onboardingStorageKeys: unique(contract.onboardingStorageKeys),
    authCookieNames: unique(contract.authCookieNames),
  };
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
