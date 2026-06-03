// PULSE — Live Codebase Nervous System
// Legacy layer types: scope inventory, codacy evidence result, capability state,
// flow projection entry, product vision, and IA guidance

import type { PulseTruthMode } from './types.structural';

// ===== NEW LAYER: Scope Inventory =====
/** Scope inventory result shape. */
export interface ScopeInventoryResult {
  /** Total files discovered property. */
  totalFilesDiscovered: number;
  /** Files by type property. */
  filesByType: Record<string, number>;
  /** Pages discovered property. */
  pagesDiscovered: string[];
  /** Routes discovered property. */
  routesDiscovered: string[];
  /** Controllers discovered property. */
  controllersDiscovered: string[];
  /** Services discovered property. */
  servicesDiscovered: string[];
  /** Schema files property. */
  schemaFiles: string[];
  /** Queue/job files property. */
  queueFiles: string[];
  /** Worker files property. */
  workerFiles: string[];
  /** Webhook files property. */
  webhookFiles: string[];
  /** Provider files property. */
  providerFiles: string[];
  /** Module files property. */
  moduleFiles: string[];
  /** UI hook files property. */
  hookFiles: string[];
  /** Form files property. */
  formFiles: string[];
  /** State files (SWR/zustand) property. */
  stateFiles: string[];
  /** Cron job files property. */
  cronFiles: string[];
  /** Script files property. */
  scriptFiles: string[];
  /** Protected governance files property. */
  protectedFiles: string[];
}

// ===== NEW LAYER: Codacy Evidence =====
/** Codacy evidence result shape. */
export interface CodeacyEvidenceResult {
  /** Severity distribution property. */
  severityDistribution: Record<'Critical' | 'High' | 'Medium' | 'Low', number>;
  /** Category hotspots property. */
  categoryHotspots: Record<string, number>;
  /** Domain hotspots property. */
  domainHotspots: Record<string, number>;
  /** Critical domains property. */
  criticalDomains: string[];
  /** Total issues property. */
  totalIssues: number;
  /** Critical issues property. */
  criticalIssues: number;
  /** High issues property. */
  highIssues: number;
  /** Last sync timestamp property. */
  lastSyncedAt: string;
}

/** Confidence measure shape. */
export interface ConfidenceMeasure {
  /** Score 0-1 property. */
  score: number;
  /** Evidence basis property. */
  evidenceBasis: string[];
  /** Truth mode property. */
  truthMode: PulseTruthMode;
}

// ===== NEW LAYER: Capability State =====
/** Capability state shape. */
export interface CapabilityStateEntry {
  /** Capability ID property. */
  id: string;
  /** Capability name property. */
  name: string;
  /** Status property. */
  status: 'real' | 'partial' | 'latent' | 'phantom';
  /** Files involved property. */
  filesInvolved: string[];
  /** Pages involved property. */
  pagesInvolved: string[];
  /** Endpoints involved property. */
  endpointsInvolved: string[];
  /** Database tables involved property. */
  tablesInvolved: string[];
  /** Jobs/workers involved property. */
  jobsInvolved: string[];
  /** Criticality 0-1 property. */
  criticality: number;
  /** Owner lane property. */
  ownerLane: string;
  /** Blockers property. */
  blockers: string[];
  /** Runtime evidence property. */
  runtimeEvidence: string[];
  /** Codacy issues property. */
  codacyIssues: string[];
  /** Confidence property. */
  confidence: ConfidenceMeasure;
}

// ===== NEW LAYER: Flow Projection =====
/** Flow step shape. */
export interface FlowStep {
  /** Step number property. */
  order: number;
  /** Description property. */
  description: string;
  /** Capabilities used property. */
  capabilitiesUsed: string[];
  /** Required state property. */
  requiredState: string[];
  /** Side effects property. */
  sideEffects: string[];
}

/** Flow projection entry shape. */
export interface FlowProjectionEntry {
  /** Flow ID property. */
  id: string;
  /** Flow name property. */
  name: string;
  /** Status property. */
  status: 'real' | 'partial' | 'latent' | 'phantom';
  /** Entry point property. */
  entryPoint: string | null;
  /** Steps property. */
  steps: FlowStep[];
  /** Dependencies property. */
  dependencies: string[];
  /** Capabilities used property. */
  capabilitiesUsed: string[];
  /** Missing persistence property. */
  missingPersistence: boolean;
  /** Missing endpoint property. */
  missingEndpoint: boolean;
  /** Missing UI property. */
  missingUI: boolean;
  /** Distance to ready 0-1 property. */
  distanceToReady: number;
  /** Blockers property. */
  blockers: string[];
  /** Confidence property. */
  confidence: ConfidenceMeasure;
}

// ===== NEW LAYER: Product Vision =====
/** Product vision surface shape. */
export interface ProductVisionSurface {
  /** Surface name property. */
  name: string;
  /** Completion percentage 0-100 property. */
  completion: number;
  /** Capabilities property. */
  capabilities: string[];
  /** Status property. */
  status: 'real' | 'partial' | 'latent' | 'phantom';
  /** Blockers property. */
  blockers: string[];
}

/** Product vision checkpoint shape. */
export interface ProductVisionCheckpoint {
  /** Description property. */
  description: string;
  /** Surfaces property. */
  surfaces: ProductVisionSurface[];
  /** Completion percentage 0-100 property. */
  completion: number;
}

// ===== NEW LAYER: IA Guidance Enriched =====
/** IA guidance unit shape. */
export interface IaGuidanceUnit {
  /** Unit ID property. */
  id: string;
  /** Title property. */
  title: string;
  /** Description property. */
  description: string;
  /** Affected capabilities property. */
  affectedCapabilities: string[];
  /** Affected flows property. */
  affectedFlows: string[];
  /** Expected gate change property. */
  expectedGateChange: Record<string, string>;
  /** Expected artifact change property. */
  expectedArtifactChange: string[];
  /** Validation target property. */
  validationTarget: string;
  /** Execution mode property. */
  executionMode: 'autonomous' | 'human_required' | 'wait';
  /** Do not touch property. */
  doNotTouch: string[];
  /** Anti-goals property. */
  antiGoals: string[];
  /** Why now property. */
  whyNow: string;
}

/** Pulse ia guidance enriched shape. */
export interface PulseIaGuidanceEnriched {
  /** Current state property. */
  currentState: string;
  /** Target checkpoint property. */
  targetCheckpoint: string;
  /** Vision gap property. */
  visionGap: string;
  /** Top blockers property. */
  topBlockers: string[];
  /** Next executable units property. */
  nextExecutableUnits: IaGuidanceUnit[];
  /** Confidence property. */
  confidence: ConfidenceMeasure;
  /** Last updated timestamp property. */
  lastUpdated: string;
}
