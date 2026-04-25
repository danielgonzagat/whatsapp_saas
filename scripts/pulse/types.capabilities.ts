// PULSE — Live Codebase Nervous System
// Capability, flow projection, external signals, and parity gap types

import type { PulseConvergenceOwnerLane } from './types.gate-failure';
import type { PulseScopeExecutionMode, PulseStructuralRole, PulseTruthMode } from './types.truth';

/** Pulse capability status type. */
export type PulseCapabilityStatus = 'real' | 'partial' | 'latent' | 'phantom';

/** Pulse capability maturity stage type. */
export type PulseCapabilityMaturityStage =
  | 'foundational'
  | 'connected'
  | 'operational'
  | 'production_ready';

/** Pulse capability maturity dimensions shape. */
export interface PulseCapabilityMaturityDimensions {
  /** Interface present property. */
  interfacePresent: boolean;
  /** Api surface present property. */
  apiSurfacePresent: boolean;
  /** Orchestration present property. */
  orchestrationPresent: boolean;
  /** Persistence present property. */
  persistencePresent: boolean;
  /** Side effect present property. */
  sideEffectPresent: boolean;
  /** Runtime evidence present property. */
  runtimeEvidencePresent: boolean;
  /** Validation present property. */
  validationPresent: boolean;
  /** Scenario coverage present property. */
  scenarioCoveragePresent: boolean;
  /** Codacy healthy property. */
  codacyHealthy: boolean;
  /** Simulation only property. */
  simulationOnly: boolean;
}

/** Pulse definition-of-done status type. */
export type PulseDoDStatus = 'done' | 'partial' | 'latent' | 'phantom';

/** Pulse definition-of-done evaluation result attached to capabilities and flows. */
export interface PulseCapabilityDoD {
  /** Status property (done|partial|latent|phantom). */
  status: PulseDoDStatus;
  /** Required structural roles that are missing or absent. */
  missingRoles: string[];
  /** Human-readable blocker explanations from the DoD evaluator. */
  blockers: string[];
  /** Whether the unit's truth mode meets the configured target. */
  truthModeMet: boolean;
}

/** Pulse capability maturity shape. */
export interface PulseCapabilityMaturity {
  /** Stage property. */
  stage: PulseCapabilityMaturityStage;
  /** Score property. */
  score: number;
  /** Dimensions property. */
  dimensions: PulseCapabilityMaturityDimensions;
  /** Missing dimensions property. */
  missing: string[];
}

/** Pulse capability shape. */
export interface PulseCapability {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Truth mode property. */
  truthMode: PulseTruthMode;
  /** Status property. */
  status: PulseCapabilityStatus;
  /** Confidence property. */
  confidence: number;
  /** User facing property. */
  userFacing: boolean;
  /** Runtime critical property. */
  runtimeCritical: boolean;
  /** Protected by governance property. */
  protectedByGovernance: boolean;
  /** Owner lane property. */
  ownerLane: PulseConvergenceOwnerLane;
  /** Execution mode property. */
  executionMode: PulseScopeExecutionMode;
  /** Roles present property. */
  rolesPresent: PulseStructuralRole[];
  /** Missing roles property. */
  missingRoles: PulseStructuralRole[];
  /** File paths property. */
  filePaths: string[];
  /** Node ids property. */
  nodeIds: string[];
  /** Route patterns property. */
  routePatterns: string[];
  /** Evidence sources property. */
  evidenceSources: string[];
  /** Codacy issue count property. */
  codacyIssueCount: number;
  /** High severity issue count property. */
  highSeverityIssueCount: number;
  /** Blocking reasons property. */
  blockingReasons: string[];
  /** Validation targets property. */
  validationTargets: string[];
  /** Maturity property. */
  maturity: PulseCapabilityMaturity;
  /** Definition-of-done evaluation (Phase 8). */
  dod: PulseCapabilityDoD;
}

/** Pulse capability state summary shape. */
export interface PulseCapabilityStateSummary {
  /** Total capabilities property. */
  totalCapabilities: number;
  /** Real capabilities property. */
  realCapabilities: number;
  /** Partial capabilities property. */
  partialCapabilities: number;
  /** Latent capabilities property. */
  latentCapabilities: number;
  /** Phantom capabilities property. */
  phantomCapabilities: number;
  /** Human required capabilities property. */
  humanRequiredCapabilities: number;
  /** Foundational capabilities property. */
  foundationalCapabilities: number;
  /** Connected capabilities property. */
  connectedCapabilities: number;
  /** Operational capabilities property. */
  operationalCapabilities: number;
  /** Production ready capabilities property. */
  productionReadyCapabilities: number;
  /** Runtime observed capabilities property. */
  runtimeObservedCapabilities: number;
  /** Scenario covered capabilities property. */
  scenarioCoveredCapabilities: number;
}

/** Pulse capability state shape. */
export interface PulseCapabilityState {
  /** Generated at property. */
  generatedAt: string;
  /** Summary property. */
  summary: PulseCapabilityStateSummary;
  /** Capabilities property. */
  capabilities: PulseCapability[];
}

/** Pulse flow projection status type. */
export type PulseFlowProjectionStatus = 'real' | 'partial' | 'latent' | 'phantom';

/** Pulse flow projection item shape. */
export interface PulseFlowProjectionItem {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Truth mode property. */
  truthMode: PulseTruthMode;
  /** Status property. */
  status: PulseFlowProjectionStatus;
  /** Confidence property. */
  confidence: number;
  /** Start nodes property. */
  startNodeIds: string[];
  /** End node ids property. */
  endNodeIds: string[];
  /** Route patterns property. */
  routePatterns: string[];
  /** Capability ids property. */
  capabilityIds: string[];
  /** Roles present property. */
  rolesPresent: PulseStructuralRole[];
  /** Missing links property. */
  missingLinks: string[];
  /** Distance to real property. */
  distanceToReal: number;
  /** Evidence sources property. */
  evidenceSources: string[];
  /** Blocking reasons property. */
  blockingReasons: string[];
  /** Validation targets property. */
  validationTargets: string[];
  /** Definition-of-done evaluation (Phase 8). */
  dod: PulseCapabilityDoD;
}

/** Pulse flow projection summary shape. */
export interface PulseFlowProjectionSummary {
  /** Total flows property. */
  totalFlows: number;
  /** Real flows property. */
  realFlows: number;
  /** Partial flows property. */
  partialFlows: number;
  /** Latent flows property. */
  latentFlows: number;
  /** Phantom flows property. */
  phantomFlows: number;
}

/** Pulse flow projection shape. */
export interface PulseFlowProjection {
  /** Generated at property. */
  generatedAt: string;
  /** Summary property. */
  summary: PulseFlowProjectionSummary;
  /** Flows property. */
  flows: PulseFlowProjectionItem[];
}

/** Pulse external signal source type. */
export type PulseExternalSignalSource =
  | 'github'
  | 'github_actions'
  | 'codacy'
  | 'codecov'
  | 'sentry'
  | 'datadog'
  | 'prometheus'
  | 'dependabot';

/**
 * Pulse external adapter status type.
 *
 * - `ready`: adapter ran and signals are fresh
 * - `not_available`: adapter required but no creds / endpoint / data
 * - `stale`: adapter ran but signal age exceeds the freshness threshold
 * - `invalid`: adapter ran but produced malformed data
 * - `optional_not_configured`: declared optional in profile/manifest, no creds; not blocking
 */
export type PulseExternalAdapterStatus =
  | 'ready'
  | 'not_available'
  | 'stale'
  | 'invalid'
  | 'optional_not_configured';

/** Pulse external signal type. */
export type PulseExternalSignalType = string;

/** Pulse external signal shape. */
export interface PulseSignal {
  /** Id property. */
  id: string;
  /** Type property. */
  type: PulseExternalSignalType;
  /** Source property. */
  source: PulseExternalSignalSource;
  /** Truth mode property. */
  truthMode: Extract<PulseTruthMode, 'observed' | 'inferred'>;
  /** Severity property. */
  severity: number;
  /** Impact score property. */
  impactScore: number;
  /** Confidence property. */
  confidence: number;
  /** Summary property. */
  summary: string;
  /** Observed at property. */
  observedAt: string | null;
  /** Related files property. */
  relatedFiles: string[];
  /** Route patterns property. */
  routePatterns: string[];
  /** Tags property. */
  tags: string[];
  /** Capability ids property. */
  capabilityIds: string[];
  /** Flow ids property. */
  flowIds: string[];
  /** Recent change refs property. */
  recentChangeRefs: string[];
  /** Owner lane property. */
  ownerLane: PulseConvergenceOwnerLane;
  /** Execution mode property. */
  executionMode: PulseScopeExecutionMode;
  /** Protected by governance property. */
  protectedByGovernance: boolean;
  /** Validation targets property. */
  validationTargets: string[];
  /** Raw reference property. */
  rawRef?: string | null;
}

/** Pulse external adapter snapshot shape. */
export interface PulseExternalAdapterSnapshot {
  /** Source property. */
  source: PulseExternalSignalSource;
  /** Source path property. */
  sourcePath: string | null;
  /** Executed property. */
  executed: boolean;
  /** Status property. */
  status: PulseExternalAdapterStatus;
  /** Generated at property. */
  generatedAt: string;
  /** Synced at property. */
  syncedAt: string | null;
  /** Freshness minutes property. */
  freshnessMinutes: number | null;
  /** Reason property. */
  reason: string;
  /** Signals property. */
  signals: PulseSignal[];
}

/** Pulse external signal summary shape. */
export interface PulseExternalSignalSummary {
  /** Total signals property. */
  totalSignals: number;
  /** Runtime signals property. */
  runtimeSignals: number;
  /** Change signals property. */
  changeSignals: number;
  /** Dependency signals property. */
  dependencySignals: number;
  /** High impact signals property. */
  highImpactSignals: number;
  /** Mapped signals property. */
  mappedSignals: number;
  /** Human required signals property. */
  humanRequiredSignals: number;
  /** Stale adapters property. */
  staleAdapters: number;
  /** Missing adapters property (required && (not_available || invalid)). */
  missingAdapters: number;
  /** Invalid adapters count (subset of missingAdapters where status==='invalid'). */
  invalidAdapters: number;
  /** Adapters skipped because they are optional and not configured (non-blocking). */
  optionalSkippedAdapters: number;
  /** Source names of missing required adapters. */
  missingAdaptersList: string[];
  /** Source names of stale required adapters. */
  staleAdaptersList: string[];
  /** Source names of invalid required adapters. */
  invalidAdaptersList: string[];
  /** Source names of optional adapters skipped (not_configured, not blocking). */
  optionalSkippedList: string[];
  /** Signals by source property. */
  bySource: Record<PulseExternalSignalSource, number>;
}

/** Pulse external signal state shape. */
export interface PulseExternalSignalState {
  /** Generated at property. */
  generatedAt: string;
  /** Truth mode property. */
  truthMode: Extract<PulseTruthMode, 'observed' | 'inferred'>;
  /** Summary property. */
  summary: PulseExternalSignalSummary;
  /** Adapters property. */
  adapters: PulseExternalAdapterSnapshot[];
  /** Signals property. */
  signals: PulseSignal[];
}

/** Pulse parity gap kind type. */
export type PulseParityGapKind =
  | 'front_without_back'
  | 'back_without_front'
  | 'ui_without_persistence'
  | 'persistence_without_consumer'
  | 'flow_without_validation'
  | 'integration_without_observability'
  | 'feature_declared_without_runtime'
  | 'runtime_without_product_surface';

/** Pulse parity gap severity type. */
export type PulseParityGapSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Pulse parity gap shape. */
export interface PulseParityGap {
  /** Id property. */
  id: string;
  /** Kind property. */
  kind: PulseParityGapKind;
  /** Severity property. */
  severity: PulseParityGapSeverity;
  /** Truth mode property. */
  truthMode: PulseTruthMode;
  /** Execution mode property. */
  executionMode: PulseScopeExecutionMode;
  /** Title property. */
  title: string;
  /** Summary property. */
  summary: string;
  /** Related files property. */
  relatedFiles: string[];
  /** Route patterns property. */
  routePatterns: string[];
  /** Affected capabilities property. */
  affectedCapabilityIds: string[];
  /** Affected flows property. */
  affectedFlowIds: string[];
  /** Validation targets property. */
  validationTargets: string[];
}

/** Pulse parity gaps summary shape. */
export interface PulseParityGapsSummary {
  /** Total gaps property. */
  totalGaps: number;
  /** Critical gaps property. */
  criticalGaps: number;
  /** High gaps property. */
  highGaps: number;
  /** By kind property. */
  byKind: Record<PulseParityGapKind, number>;
}

/** Pulse parity gaps artifact shape. */
export interface PulseParityGapsArtifact {
  /** Generated at property. */
  generatedAt: string;
  /** Summary property. */
  summary: PulseParityGapsSummary;
  /** Gaps property. */
  gaps: PulseParityGap[];
}
