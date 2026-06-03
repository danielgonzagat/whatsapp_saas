// PULSE — Live Codebase Nervous System
// Parity-gap types (extracted from types.capabilities.ts to keep that file under
// the architecture-guardrails size cap).  These types describe gaps detected
// between front-end / back-end / persistence / runtime surfaces of the product.

import type { PulseScopeExecutionMode, PulseTruthMode } from './types.truth';

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
