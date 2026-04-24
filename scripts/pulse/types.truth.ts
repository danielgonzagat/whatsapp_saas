// PULSE — Live Codebase Nervous System
// Codebase truth, scope inventory, and codacy summary types

import type { PulseModuleState } from './types.health';
import type { PulseConvergenceOwnerLane } from './types.gate-failure';
import type { PulseShellComplexity, PulseStructuralRole } from './types.structural';
export type * from './types.structural'; // Re-export structural types for truth consumers

/** Pulse truth page summary shape. */
export interface PulseTruthPageSummary {
  /** Route property. */
  route: string;
  /** Group property. */
  group: string;
  /** Module key property. */
  moduleKey: string;
  /** Module name property. */
  moduleName: string;
  /** Shell complexity property. */
  shellComplexity: PulseShellComplexity;
  /** Total interactions property. */
  totalInteractions: number;
  /** Functioning interactions property. */
  functioningInteractions: number;
  /** Facade interactions property. */
  facadeInteractions: number;
  /** Broken interactions property. */
  brokenInteractions: number;
  /** Incomplete interactions property. */
  incompleteInteractions: number;
  /** Absent interactions property. */
  absentInteractions: number;
  /** Api bound interactions property. */
  apiBoundInteractions: number;
  /** Backend bound interactions property. */
  backendBoundInteractions: number;
  /** Persisted interactions property. */
  persistedInteractions: number;
  /** Total data sources property. */
  totalDataSources: number;
  /** Backed data sources property. */
  backedDataSources: number;
  /** Semantic tokens property. */
  semanticTokens?: string[];
  /** Structural tokens property. */
  structuralTokens?: string[];
}

/** Pulse discovered module shape. */
export interface PulseDiscoveredModule {
  /** Key property. */
  key: string;
  /** Name property. */
  name: string;
  /** Route roots property. */
  routeRoots: string[];
  /** Groups property. */
  groups: string[];
  /** User facing property. */
  userFacing: boolean;
  /** Shell complexity property. */
  shellComplexity: PulseShellComplexity;
  /** Page count property. */
  pageCount: number;
  /** Total interactions property. */
  totalInteractions: number;
  /** Functioning interactions property. */
  functioningInteractions: number;
  /** Facade interactions property. */
  facadeInteractions: number;
  /** Broken interactions property. */
  brokenInteractions: number;
  /** Incomplete interactions property. */
  incompleteInteractions: number;
  /** Absent interactions property. */
  absentInteractions: number;
  /** Api bound interactions property. */
  apiBoundInteractions: number;
  /** Backend bound interactions property. */
  backendBoundInteractions: number;
  /** Persisted interactions property. */
  persistedInteractions: number;
  /** Total data sources property. */
  totalDataSources: number;
  /** Backed data sources property. */
  backedDataSources: number;
  /** Semantic tokens property. */
  semanticTokens?: string[];
  /** Structural tokens property. */
  structuralTokens?: string[];
  /** State property. */
  state: PulseModuleState;
  /** Declared module property. */
  declaredModule: string | null;
  /** Notes property. */
  notes: string;
}

/** Pulse discovered flow candidate shape. */
export interface PulseDiscoveredFlowCandidate {
  /** Id property. */
  id: string;
  /** Module key property. */
  moduleKey: string;
  /** Module name property. */
  moduleName: string;
  /** Page route property. */
  pageRoute: string;
  /** Element label property. */
  elementLabel: string;
  /** Http method property. */
  httpMethod: string;
  /** Endpoint property. */
  endpoint: string;
  /** Backend route property. */
  backendRoute: string | null;
  /** Connected property. */
  connected: boolean;
  /** Persistent property. */
  persistent: boolean;
  /** Semantic tokens property. */
  semanticTokens?: string[];
  /** Declared flow property. */
  declaredFlow: string | null;
}

/** Pulse truth divergence shape. */
export interface PulseTruthDivergence {
  /** Declared not discovered property. */
  declaredNotDiscovered: string[];
  /** Discovered not declared property. */
  discoveredNotDeclared: string[];
  /** Declared but internal property. */
  declaredButInternal: string[];
  /** Frontend surface without backend support property. */
  frontendSurfaceWithoutBackendSupport: string[];
  /** Backend capability without frontend surface property. */
  backendCapabilityWithoutFrontendSurface: string[];
  /** Shell without persistence property. */
  shellWithoutPersistence: string[];
  /** Flow candidates without oracle property. */
  flowCandidatesWithoutOracle: string[];
  /** Blocker count property. */
  blockerCount: number;
  /** Warning count property. */
  warningCount: number;
}

/** Pulse codebase truth summary shape. */
export interface PulseCodebaseTruthSummary {
  /** Total pages property. */
  totalPages: number;
  /** User facing pages property. */
  userFacingPages: number;
  /** Discovered modules property. */
  discoveredModules: number;
  /** Discovered flows property. */
  discoveredFlows: number;
  /** Blocker count property. */
  blockerCount: number;
  /** Warning count property. */
  warningCount: number;
}

/** Pulse codebase truth shape. */
export interface PulseCodebaseTruth {
  /** Generated at property. */
  generatedAt: string;
  /** Summary property. */
  summary: PulseCodebaseTruthSummary;
  /** Pages property. */
  pages: PulseTruthPageSummary[];
  /** Discovered modules property. */
  discoveredModules: PulseDiscoveredModule[];
  /** Discovered flows property. */
  discoveredFlows: PulseDiscoveredFlowCandidate[];
  /** Divergence property. */
  divergence: PulseTruthDivergence;
}

/** Pulse scope surface type. */
export type PulseScopeSurface =
  | 'frontend'
  | 'frontend-admin'
  | 'backend'
  | 'worker'
  | 'prisma'
  | 'e2e'
  | 'scripts'
  | 'docs'
  | 'infra'
  | 'governance'
  | 'root-config'
  | 'artifacts'
  | 'misc';

/** Pulse scope file kind type. */
export type PulseScopeFileKind =
  | 'source'
  | 'spec'
  | 'migration'
  | 'config'
  | 'document'
  | 'artifact';

/** Pulse scope execution mode type. */
export type PulseScopeExecutionMode = 'ai_safe' | 'human_required' | 'observation_only';

/** Pulse codacy severity type. */
export type PulseCodacySeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

/** Pulse codacy issue shape. */
export interface PulseCodacyIssue {
  /** Issue id property. */
  issueId: string;
  /** File path property. */
  filePath: string;
  /** Line number property. */
  lineNumber: number;
  /** Pattern id property. */
  patternId: string;
  /** Category property. */
  category: string;
  /** Severity level property. */
  severityLevel: PulseCodacySeverity;
  /** Tool property. */
  tool: string;
  /** Message property. */
  message: string;
  /** Commit sha property. */
  commitSha: string | null;
  /** Commit timestamp property. */
  commitTimestamp: string | null;
}

/** Pulse codacy hotspot shape. */
export interface PulseCodacyHotspot {
  /** File path property. */
  filePath: string;
  /** Issue count property. */
  issueCount: number;
  /** Highest severity property. */
  highestSeverity: PulseCodacySeverity;
  /** Categories property. */
  categories: string[];
  /** Tools property. */
  tools: string[];
  /** High severity count property. */
  highSeverityCount: number;
}

/** Pulse codacy summary shape. */
export interface PulseCodacySummary {
  /** Snapshot available property. */
  snapshotAvailable: boolean;
  /** Source path property. */
  sourcePath: string | null;
  /** Synced at property. */
  syncedAt: string | null;
  /** Age minutes property. */
  ageMinutes: number | null;
  /** Stale property. */
  stale: boolean;
  /** Repository loc property. */
  loc: number;
  /** Total issues property. */
  totalIssues: number;
  /** Severity counts property. */
  severityCounts: Record<PulseCodacySeverity, number>;
  /** Tool counts property. */
  toolCounts: Record<string, number>;
  /** Top files property. */
  topFiles: PulseCodacyHotspot[];
  /** High priority batch property. */
  highPriorityBatch: PulseCodacyIssue[];
  /** Observed files property. */
  observedFiles: string[];
}

/** Pulse scope file shape. */
export interface PulseScopeFile {
  /** Path property. */
  path: string;
  /** Extension property. */
  extension: string;
  /** Line count property. */
  lineCount: number;
  /** Surface property. */
  surface: PulseScopeSurface;
  /** Kind property. */
  kind: PulseScopeFileKind;
  /** Runtime critical property. */
  runtimeCritical: boolean;
  /** User facing property. */
  userFacing: boolean;
  /** Owner lane property. */
  ownerLane: PulseConvergenceOwnerLane;
  /** Execution mode property. */
  executionMode: PulseScopeExecutionMode;
  /** Protected by governance property. */
  protectedByGovernance: boolean;
  /** Codacy tracked property. */
  codacyTracked: boolean;
  /** Module candidate property. */
  moduleCandidate: string | null;
  /** Observed codacy issues property. */
  observedCodacyIssueCount: number;
  /** High severity issue count property. */
  highSeverityIssueCount: number;
  /** Highest observed severity property. */
  highestObservedSeverity: PulseCodacySeverity | null;
  /** Structural hints property. */
  structuralHints?: PulseStructuralRole[];
}

/** Pulse scope module aggregate shape. */
export interface PulseScopeModuleAggregate {
  /** Module key property. */
  moduleKey: string;
  /** File count property. */
  fileCount: number;
  /** Runtime critical file count property. */
  runtimeCriticalFileCount: number;
  /** User facing file count property. */
  userFacingFileCount: number;
  /** Human required file count property. */
  humanRequiredFileCount: number;
  /** Observed codacy issue count property. */
  observedCodacyIssueCount: number;
  /** High severity issue count property. */
  highSeverityIssueCount: number;
  /** Surface kinds property. */
  surfaces: PulseScopeSurface[];
}

/** Pulse scope parity status type. */
export type PulseScopeParityStatus = 'pass' | 'fail';

/** Pulse scope parity confidence type. */
export type PulseScopeParityConfidence = 'high' | 'medium' | 'low';

/** Pulse scope parity shape. */
export interface PulseScopeParity {
  /** Status property. */
  status: PulseScopeParityStatus;
  /** Mode property. */
  mode: 'repo_inventory_with_codacy_spotcheck';
  /** Confidence property. */
  confidence: PulseScopeParityConfidence;
  /** Reason property. */
  reason: string;
  /** Inventory files property. */
  inventoryFiles: number;
  /** Codacy observed files property. */
  codacyObservedFiles: number;
  /** Codacy observed files covered property. */
  codacyObservedFilesCovered: number;
  /** Missing codacy files property. */
  missingCodacyFiles: string[];
}

/** Pulse scope state summary shape. */
export interface PulseScopeStateSummary {
  /** Total files property. */
  totalFiles: number;
  /** Total lines property. */
  totalLines: number;
  /** Runtime critical files property. */
  runtimeCriticalFiles: number;
  /** User facing files property. */
  userFacingFiles: number;
  /** Human required files property. */
  humanRequiredFiles: number;
  /** Surface counts property. */
  surfaceCounts: Record<PulseScopeSurface, number>;
  /** Kind counts property. */
  kindCounts: Record<PulseScopeFileKind, number>;
  /** Unmapped module candidates property. */
  unmappedModuleCandidates: string[];
}

/** Pulse scope state shape. */
export interface PulseScopeState {
  /** Generated at property. */
  generatedAt: string;
  /** Root dir property. */
  rootDir: string;
  /** Summary property. */
  summary: PulseScopeStateSummary;
  /** Parity property. */
  parity: PulseScopeParity;
  /** Codacy summary property. */
  codacy: PulseCodacySummary;
  /** Files property. */
  files: PulseScopeFile[];
  /** Module aggregates property. */
  moduleAggregates: PulseScopeModuleAggregate[];
}
