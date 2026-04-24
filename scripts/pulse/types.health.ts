// PULSE — Live Codebase Nervous System
// Health, config, and base manifest spec types

import type { BreakType } from './types.break-types';

// ===== Graph =====
export interface Break {
  /** Type property. */
  type: BreakType;
  /** Severity property. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Description property. */
  description: string;
  /** Detail property. */
  detail: string;
  /** Source property. */
  source?: string;
  /** Surface property. */
  surface?: string;
}

/** Pulse health shape. */
export interface PulseHealth {
  /** Score property. */
  score: number;
  /** Total nodes property. */
  totalNodes: number;
  /** Breaks property. */
  breaks: Break[];
  /** Stats property. */
  stats: {
    uiElements: number;
    uiDeadHandlers: number;
    apiCalls: number;
    apiNoRoute: number;
    backendRoutes: number;
    backendEmpty: number;
    prismaModels: number;
    modelOrphans: number;
    facades: number;
    facadesBySeverity: { high: number; medium: number; low: number };
    proxyRoutes: number;
    proxyNoUpstream: number;
    securityIssues: number;
    dataSafetyIssues: number;
    qualityIssues: number;
    unavailableChecks: number;
    unknownSurfaces: number;
    functionalMap?: {
      totalInteractions: number;
      byStatus: Record<string, number>;
      functionalScore: number;
    };
  };
  /** Timestamp property. */
  timestamp: string;
}

// ===== Config =====
export interface PulseConfig {
  /** Root dir property. */
  rootDir: string;
  /** Frontend dir property. */
  frontendDir: string;
  /** Frontend source dirs property. */
  frontendDirs?: string[];
  /** Backend dir property. */
  backendDir: string;
  /** Worker dir property. */
  workerDir: string;
  /** Schema path property. */
  schemaPath: string;
  /** Global prefix property. */
  globalPrefix: string;
  /** Certification profile property. */
  certificationProfile?: PulseCertificationProfile | null;
}

// ===== Module States =====
export type PulseModuleState =
  | 'READY'
  | 'PARTIAL'
  | 'SHELL_ONLY'
  | 'MOCKED'
  | 'BROKEN'
  | 'INTERNAL';

/** Pulse manifest module shape. */
export interface PulseManifestModule {
  /** Name property. */
  name: string;
  /** State property. */
  state: PulseModuleState;
  /** Notes property. */
  notes: string;
  /** Critical property. */
  critical?: boolean;
}

/** Pulse environment type. */
export type PulseEnvironment = 'scan' | 'deep' | 'total';
/** Pulse certification profile type. */
export type PulseCertificationProfile = 'core-critical' | 'full-product';
/** Pulse flow runner type. */
export type PulseFlowRunner = 'runtime-e2e' | 'browser-stress' | 'hybrid';
/** Pulse flow oracle type. */
export type PulseFlowOracle =
  | 'auth-session'
  | 'entity-persisted'
  | 'payment-lifecycle'
  | 'wallet-ledger'
  | 'conversation-persisted';

/** Pulse actor kind type. */
export type PulseActorKind = 'customer' | 'operator' | 'admin' | 'system';
/** Pulse scenario kind type. */
export type PulseScenarioKind =
  | 'single-session'
  | 'multi-session'
  | 'multi-actor'
  | 'long-lived'
  | 'async-reconciled';
/** Pulse scenario runner type. */
export type PulseScenarioRunner = 'playwright-spec' | 'derived';
/** Pulse scenario execution mode type. */
export type PulseScenarioExecutionMode = 'real' | 'derived' | 'mapping';
/** Pulse provider mode type. */
export type PulseProviderMode = 'replay' | 'sandbox' | 'real_smoke' | 'hybrid';
/** Pulse time window mode type. */
export type PulseTimeWindowMode = 'total' | 'shift' | 'soak';

/** Pulse actor profile shape. */
export interface PulseActorProfile {
  /** Id property. */
  id: string;
  /** Kind property. */
  kind: PulseActorKind;
  /** Description property. */
  description: string;
  /** Module focus property. */
  moduleFocus: string[];
  /** Default time window modes property. */
  defaultTimeWindowModes: PulseTimeWindowMode[];
}

/** Pulse manifest scenario spec shape. */
export interface PulseManifestScenarioSpec {
  /** Id property. */
  id: string;
  /** Actor kind property. */
  actorKind: PulseActorKind;
  /** Scenario kind property. */
  scenarioKind: PulseScenarioKind;
  /** Critical property. */
  critical: boolean;
  /** Module keys property. */
  moduleKeys: string[];
  /** Route patterns property. */
  routePatterns: string[];
  /** Flow specs property. */
  flowSpecs: string[];
  /** Flow groups property. */
  flowGroups: string[];
  /** Playwright specs property. */
  playwrightSpecs: string[];
  /** Runtime probes property. */
  runtimeProbes: string[];
  /** Requires browser property. */
  requiresBrowser: boolean;
  /** Requires persistence property. */
  requiresPersistence: boolean;
  /** Async expectations property. */
  asyncExpectations: string[];
  /** Provider mode property. */
  providerMode: PulseProviderMode;
  /** Time window modes property. */
  timeWindowModes: PulseTimeWindowMode[];
  /** Runner property. */
  runner: PulseScenarioRunner;
  /** Execution mode property. */
  executionMode: PulseScenarioExecutionMode;
  /** World state keys property. */
  worldStateKeys: string[];
  /** Required artifacts property. */
  requiredArtifacts: string[];
  /** Notes property. */
  notes: string;
}

/** Pulse manifest flow spec shape. */
export interface PulseManifestFlowSpec {
  /** Id property. */
  id: string;
  /** Surface property. */
  surface: string;
  /** Runner property. */
  runner: PulseFlowRunner;
  /** Oracle property. */
  oracle: PulseFlowOracle;
  /** Provider mode property. */
  providerMode: PulseProviderMode;
  /** Smoke required property. */
  smokeRequired: boolean;
  /** Critical property. */
  critical: boolean;
  /** Preconditions property. */
  preconditions: string[];
  /** Environments property. */
  environments: PulseEnvironment[];
  /** Notes property. */
  notes: string;
}

/** Pulse invariant source type. */
export type PulseInvariantSource = 'static' | 'runtime' | 'hybrid';
/** Pulse invariant evaluator type. */
export type PulseInvariantEvaluator =
  | 'workspace-isolation'
  | 'financial-audit-trail'
  | 'payment-idempotency'
  | 'wallet-balance-consistency';

/** Pulse manifest invariant spec shape. */
export interface PulseManifestInvariantSpec {
  /** Id property. */
  id: string;
  /** Surface property. */
  surface: string;
  /** Source property. */
  source: PulseInvariantSource;
  /** Evaluator property. */
  evaluator: PulseInvariantEvaluator;
  /** Critical property. */
  critical: boolean;
  /** Depends on property. */
  dependsOn: string[];
  /** Environments property. */
  environments: PulseEnvironment[];
  /** Notes property. */
  notes: string;
}

/** Pulse temporary acceptance target type type. */
export type PulseTemporaryAcceptanceTargetType =
  | 'gate'
  | 'break_type'
  | 'surface'
  | 'flow'
  | 'invariant';

/** Pulse temporary acceptance shape. */
export interface PulseTemporaryAcceptance {
  /** Id property. */
  id: string;
  /** Target type property. */
  targetType: PulseTemporaryAcceptanceTargetType;
  /** Target property. */
  target: string;
  /** Reason property. */
  reason: string;
  /** Expires at property. */
  expiresAt: string;
}

/** Pulse manifest overrides shape. */
export interface PulseManifestOverrides {
  /** Excluded modules property. */
  excludedModules?: string[];
  /** Critical modules property. */
  criticalModules?: string[];
  /** Internal modules property. */
  internalModules?: string[];
  /** Module aliases property. */
  moduleAliases?: Record<string, string>;
  /** Flow aliases property. */
  flowAliases?: Record<string, string>;
  /** Excluded flow candidates property. */
  excludedFlowCandidates?: string[];
}

// Re-export manifest types for backward compat (defined in types.manifest.ts)
export type {
  PulseManifestCertificationTier,
  PulseManifestFinalReadinessCriteria,
  PulseManifest,
  PulseGateName,
  PulseManifestLoadResult,
  PulseParserUnavailable,
  PulseParserDefinition,
  PulseParserInventory,
} from './types.manifest';
