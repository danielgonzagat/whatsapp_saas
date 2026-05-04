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

export interface ManifestModule {
  key?: string;
  routeRoots?: string[];
  groups?: string[];
  userFacing?: boolean;
  critical?: boolean;
  state?: string;
  pageCount?: number;
}

export interface ResolvedManifestOverlay {
  modules?: ManifestModule[];
}

export interface RouteCandidate {
  path: string;
  method: string;
  sourceRank: number;
  text: string;
}

export {
  PRODUCT_GRAPH_FILE,
  BEHAVIOR_GRAPH_FILE,
  SCOPE_STATE_FILE,
  RESOLVED_MANIFEST_FILE,
  STORAGE_KEY_RE,
  STORAGE_CONST_RE,
  COOKIE_GET_RE,
  DOCUMENT_COOKIE_RE,
  CONST_LITERAL_RE,
  CONST_JOIN_RE,
};
