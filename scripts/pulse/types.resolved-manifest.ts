// PULSE — Live Codebase Nervous System
// Resolved manifest: modules, flow groups, and manifest reconciliation types

import type {
  PulseActorProfile,
  PulseManifestCertificationTier,
  PulseManifestFinalReadinessCriteria,
  PulseManifestFlowSpec,
  PulseManifestInvariantSpec,
  PulseManifestScenarioSpec,
  PulseTemporaryAcceptance,
} from './types.health';
import type { PulseModuleState } from './types.health';
import type { PulseScopeSurface, PulseShellComplexity } from './types.truth';

/** Pulse resolved module resolution type. */
export type PulseResolvedModuleResolution = 'matched' | 'derived' | 'excluded';
/** Pulse resolved module kind type. */
export type PulseResolvedModuleKind = 'user_facing' | 'internal' | 'shared' | 'legacy';

/** Pulse resolved module coverage status type. */
export type PulseResolvedModuleCoverageStatus =
  | 'declared_and_discovered'
  | 'discovered_only'
  | 'declared_only'
  | 'excluded';

/** Pulse resolved module shape. */
export interface PulseResolvedModule {
  /** Key property. */
  key: string;
  /** Name property. */
  name: string;
  /** Canonical name property. */
  canonicalName: string;
  /** Aliases property. */
  aliases: string[];
  /** Route roots property. */
  routeRoots: string[];
  /** Groups property. */
  groups: string[];
  /** Module kind property. */
  moduleKind: PulseResolvedModuleKind;
  /** User facing property. */
  userFacing: boolean;
  /** Shell complexity property. */
  shellComplexity: PulseShellComplexity;
  /** State property. */
  state: PulseModuleState;
  /** Critical property. */
  critical: boolean;
  /** Resolution property. */
  resolution: PulseResolvedModuleResolution;
  /** Source module property. */
  sourceModule: string | null;
  /** Legacy source property. */
  legacySource: string | null;
  /** Coverage status property. */
  coverageStatus: PulseResolvedModuleCoverageStatus;
  /** Declared by manifest property. */
  declaredByManifest: boolean;
  /** Discovered file count property. */
  discoveredFileCount: number;
  /** Codacy issue count property. */
  codacyIssueCount: number;
  /** High severity issue count property. */
  highSeverityIssueCount: number;
  /** Protected by governance property. */
  protectedByGovernance: boolean;
  /** Surface kinds property. */
  surfaceKinds: PulseScopeSurface[];
  /** Page count property. */
  pageCount: number;
  /** Total interactions property. */
  totalInteractions: number;
  /** Backend bound interactions property. */
  backendBoundInteractions: number;
  /** Persisted interactions property. */
  persistedInteractions: number;
  /** Backed data sources property. */
  backedDataSources: number;
  /** Notes property. */
  notes: string;
}

/** Pulse resolved flow resolution type. */
export type PulseResolvedFlowResolution =
  | 'matched'
  | 'accepted'
  | 'grouped'
  | 'candidate'
  | 'excluded';
/** Pulse resolved flow kind type. */
export type PulseResolvedFlowKind =
  | 'feature_flow'
  | 'shared_capability'
  | 'ops_internal'
  | 'legacy_noise';

/** Pulse resolved flow group shape. */
export interface PulseResolvedFlowGroup {
  /** Id property. */
  id: string;
  /** Canonical name property. */
  canonicalName: string;
  /** Aliases property. */
  aliases: string[];
  /** Flow kind property. */
  flowKind: PulseResolvedFlowKind;
  /** Module key property. */
  moduleKey: string;
  /** Module name property. */
  moduleName: string;
  /** Module keys property. */
  moduleKeys: string[];
  /** Module names property. */
  moduleNames: string[];
  /** Page routes property. */
  pageRoutes: string[];
  /** Actions property. */
  actions: string[];
  /** Endpoints property. */
  endpoints: string[];
  /** Backend routes property. */
  backendRoutes: string[];
  /** Connected property. */
  connected: boolean;
  /** Persistent property. */
  persistent: boolean;
  /** Member count property. */
  memberCount: number;
  /** Critical property. */
  critical: boolean;
  /** Resolution property. */
  resolution: PulseResolvedFlowResolution;
  /** Matched flow spec property. */
  matchedFlowSpec: string | null;
  /** Notes property. */
  notes: string;
}

/** Pulse resolved manifest diagnostics shape. */
export interface PulseResolvedManifestDiagnostics {
  /** Unresolved modules property. */
  unresolvedModules: string[];
  /** Orphan manual modules property. */
  orphanManualModules: string[];
  /** Scope only module candidates property. */
  scopeOnlyModuleCandidates: string[];
  /** Human required modules property. */
  humanRequiredModules: string[];
  /** Unresolved flow groups property. */
  unresolvedFlowGroups: string[];
  /** Orphan flow specs property. */
  orphanFlowSpecs: string[];
  /** Excluded modules property. */
  excludedModules: string[];
  /** Excluded flow groups property. */
  excludedFlowGroups: string[];
  /** Legacy manual modules property. */
  legacyManualModules: string[];
  /** Grouped flow groups property. */
  groupedFlowGroups: string[];
  /** Shared capability groups property. */
  sharedCapabilityGroups: string[];
  /** Ops internal flow groups property. */
  opsInternalFlowGroups: string[];
  /** Legacy noise flow groups property. */
  legacyNoiseFlowGroups: string[];
  /** Blocker count property. */
  blockerCount: number;
  /** Warning count property. */
  warningCount: number;
}

/** Pulse resolved manifest summary shape. */
export interface PulseResolvedManifestSummary {
  /** Total modules property. */
  totalModules: number;
  /** Resolved modules property. */
  resolvedModules: number;
  /** Unresolved modules property. */
  unresolvedModules: number;
  /** Scope only module candidates property. */
  scopeOnlyModuleCandidates: number;
  /** Human required modules property. */
  humanRequiredModules: number;
  /** Total flow groups property. */
  totalFlowGroups: number;
  /** Resolved flow groups property. */
  resolvedFlowGroups: number;
  /** Unresolved flow groups property. */
  unresolvedFlowGroups: number;
  /** Orphan manual modules property. */
  orphanManualModules: number;
  /** Orphan flow specs property. */
  orphanFlowSpecs: number;
  /** Excluded modules property. */
  excludedModules: number;
  /** Excluded flow groups property. */
  excludedFlowGroups: number;
  /** Grouped flow groups property. */
  groupedFlowGroups: number;
  /** Shared capability groups property. */
  sharedCapabilityGroups: number;
  /** Ops internal flow groups property. */
  opsInternalFlowGroups: number;
  /** Legacy noise flow groups property. */
  legacyNoiseFlowGroups: number;
  /** Legacy manual modules property. */
  legacyManualModules: number;
}

/** Pulse resolved manifest shape. */
export interface PulseResolvedManifest {
  /** Generated at property. */
  generatedAt: string;
  /** Source manifest path property. */
  sourceManifestPath: string | null;
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
  modules: PulseResolvedModule[];
  /** Flow groups property. */
  flowGroups: PulseResolvedFlowGroup[];
  /** Actor profiles property. */
  actorProfiles: PulseActorProfile[];
  /** Scenario specs property. */
  scenarioSpecs: PulseManifestScenarioSpec[];
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
  /** Security requirements property. */
  securityRequirements: string[];
  /** Recovery requirements property. */
  recoveryRequirements: string[];
  /** Slos property. */
  slos: Record<string, number | string>;
  /** Summary property. */
  summary: PulseResolvedManifestSummary;
  /** Diagnostics property. */
  diagnostics: PulseResolvedManifestDiagnostics;
}
