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
