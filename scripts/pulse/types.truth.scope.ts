// PULSE — Repository scope inventory types
// Extracted from types.truth.ts to honour architecture guardrails.

import type { PulseConvergenceOwnerLane } from './types.gate-failure';
import type { PulseStructuralRole } from './types.structural';
import type { PulseCodacySeverity, PulseCodacySummary } from './types.truth.codacy';

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

/** Pulse scope orphan file shape. */
export interface PulseScopeOrphanFile {
  /** Path property. */
  path: string;
  /** Line count property. */
  lineCount: number;
  /** Surface property. */
  surface: PulseScopeSurface;
  /** Kind property. */
  kind: PulseScopeFileKind;
  /** Reason property. */
  reason: string;
}

/** Pulse scope excluded file shape. */
export interface PulseScopeExcludedFile {
  /** Path property. */
  path: string;
  /** Exclude reason property. */
  excludeReason: string;
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
  /** 0-100 percentage of repo files successfully inventoried. */
  inventoryCoverage: number;
  /** 0-100 percentage of files classified by surface/kind. */
  classificationCoverage: number;
  /** 0-100 percentage of files connected to the structural graph. */
  structuralGraphCoverage: number;
  /** 0-100 percentage of source files that have associated test/spec files. */
  testCoverage: number;
  /** 0-100 percentage of defined scenarios that have been exercised. */
  scenarioCoverage: number;
  /** 0-100 percentage of runtime evidence probes that returned data. */
  runtimeEvidenceCoverage: number;
  /** 0-100 percentage of production-readiness proofs satisfied. */
  productionProofCoverage: number;
  /** Files not connected to any structural chain. */
  orphanFiles: PulseScopeOrphanFile[];
  /** Files that could not be classified. */
  unknownFiles: PulseScopeFile[];
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
  /** Files excluded from scope walk with reasons. */
  excludedFiles: PulseScopeExcludedFile[];
}
