// PULSE — Live Codebase Nervous System
// Codebase truth contract. Codacy + scope types live in sibling modules
// (types.truth.codacy.ts, types.truth.scope.ts) and are re-exported here so
// that this file remains the canonical barrel for downstream consumers.

import type { PulseModuleState } from './types.health';
import type { PulseShellComplexity } from './types.structural';

export type * from './types.structural'; // Re-export structural types for truth consumers
export type * from './types.truth.codacy';
export type * from './types.truth.scope';

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
