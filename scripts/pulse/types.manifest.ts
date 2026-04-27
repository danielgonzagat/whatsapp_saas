// PULSE — Live Codebase Nervous System
// Manifest shape, gate names, and parser inventory types

import type {
  PulseActorProfile,
  PulseManifestScenarioSpec,
  PulseManifestFlowSpec,
  PulseManifestInvariantSpec,
  PulseTemporaryAcceptance,
  PulseManifestOverrides,
  PulseManifestModule,
  PulseEnvironment,
  PulseModuleState,
  PulseConfig,
  Break,
} from './types.health';

/** Pulse manifest certification tier shape. */
export interface PulseManifestCertificationTier {
  /** Id property. */
  id: number;
  /** Name property. */
  name: string;
  /** Gates property. */
  gates: PulseGateName[];
  /** Require no accepted flows property. */
  requireNoAcceptedFlows?: boolean;
  /** Require no accepted scenarios property. */
  requireNoAcceptedScenarios?: boolean;
  /** Require world state convergence property. */
  requireWorldStateConvergence?: boolean;
}

/** Pulse manifest final readiness criteria shape. */
export interface PulseManifestFinalReadinessCriteria {
  /** Require all tiers pass property. */
  requireAllTiersPass: boolean;
  /** Require no accepted critical flows property. */
  requireNoAcceptedCriticalFlows: boolean;
  /** Require no accepted critical scenarios property. */
  requireNoAcceptedCriticalScenarios: boolean;
  /** Require world state convergence property. */
  requireWorldStateConvergence: boolean;
}

/** Pulse manifest shape. */
export interface PulseManifest {
  /** Version property. */
  version: number;
  /** Project id property. */
  projectId: string;
  /** Project name property. */
  projectName: string;
  /** System type property. */
  systemType: string;
  /** Supported stacks property. */
  supportedStacks: string[];
  /** Surfaces property. */
  surfaces: string[];
  /** Critical domains property. */
  criticalDomains: string[];
  /** Modules property. */
  modules: PulseManifestModule[];
  /** Legacy modules property. */
  legacyModules?: PulseManifestModule[];
  /** Actor profiles property. */
  actorProfiles: PulseActorProfile[];
  /** Scenario specs property. */
  scenarioSpecs: PulseManifestScenarioSpec[];
  /** External integrations property. */
  externalIntegrations: string[];
  /** Jobs property. */
  jobs: string[];
  /** Webhooks property. */
  webhooks: string[];
  /** State machines property. */
  stateMachines: string[];
  /** Critical flows property. */
  criticalFlows: string[];
  /** Invariants property. */
  invariants: string[];
  /** Flow specs property. */
  flowSpecs: PulseManifestFlowSpec[];
  /** Invariant specs property. */
  invariantSpecs: PulseManifestInvariantSpec[];
  /** Temporary acceptances property. */
  temporaryAcceptances: PulseTemporaryAcceptance[];
  /** Certification tiers property. */
  certificationTiers: PulseManifestCertificationTier[];
  /** Final readiness criteria property. */
  finalReadinessCriteria: PulseManifestFinalReadinessCriteria;
  /** Slos property. */
  slos: Record<string, number | string>;
  /** Security requirements property. */
  securityRequirements: string[];
  /** Recovery requirements property. */
  recoveryRequirements: string[];
  /** Excluded surfaces property. */
  excludedSurfaces: string[];
  /** Environments property. */
  environments: PulseEnvironment[];
  /** Evidence ttl hours property. */
  evidenceTtlHours?: number;
  /** Adapter config property. */
  adapterConfig?: Record<string, unknown>;
  /** Overrides property. */
  overrides?: PulseManifestOverrides;
}

/** Pulse gate name type. */
export type PulseGateName =
  | 'scopeClosed'
  | 'adapterSupported'
  | 'specComplete'
  | 'truthExtractionPass'
  | 'staticPass'
  | 'runtimePass'
  | 'changeRiskPass'
  | 'productionDecisionPass'
  | 'browserPass'
  | 'flowPass'
  | 'invariantPass'
  | 'securityPass'
  | 'isolationPass'
  | 'recoveryPass'
  | 'performancePass'
  | 'observabilityPass'
  | 'customerPass'
  | 'operatorPass'
  | 'adminPass'
  | 'soakPass'
  | 'syntheticCoveragePass'
  | 'evidenceFresh'
  | 'pulseSelfTrustPass'
  | 'noOverclaimPass'
  | 'multiCycleConvergencePass'
  | 'testHonestyPass'
  | 'assertionStrengthPass'
  | 'typeIntegrityPass';

/** Pulse manifest load result shape. */
export interface PulseManifestLoadResult {
  /** Manifest property. */
  manifest: PulseManifest | null;
  /** Manifest path property. */
  manifestPath: string | null;
  /** Issues property. */
  issues: Break[];
  /** Unknown surfaces property. */
  unknownSurfaces: string[];
  /** Unsupported stacks property. */
  unsupportedStacks: string[];
}

/** Pulse parser unavailable shape. */
export interface PulseParserUnavailable {
  /** Name property. */
  name: string;
  /** File property. */
  file: string;
  /** Reason property. */
  reason: string;
}

/** Pulse parser definition shape. */
export interface PulseParserDefinition {
  /** Name property. */
  name: string;
  /** File property. */
  file: string;
  /** Fn property. */
  fn: (config: PulseConfig) => Break[] | Promise<Break[]>;
}

/** Pulse parser inventory shape. */
export interface PulseParserInventory {
  /** Discovered checks property. */
  discoveredChecks: string[];
  /** Loaded checks property. */
  loadedChecks: PulseParserDefinition[];
  /** Unavailable checks property. */
  unavailableChecks: PulseParserUnavailable[];
  /** Helper files skipped property. */
  helperFilesSkipped: string[];
}

// Re-export base types for convenience
export type {
  PulseModuleState,
  PulseConfig,
  PulseEnvironment,
  PulseManifestModule,
  PulseActorProfile,
  PulseManifestScenarioSpec,
  PulseManifestFlowSpec,
  PulseManifestInvariantSpec,
  PulseTemporaryAcceptance,
  PulseManifestOverrides,
  Break,
};
