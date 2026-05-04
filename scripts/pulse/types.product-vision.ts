// PULSE — Live Codebase Nervous System
// Product vision: current/projected state and surface/experience summaries

import type { PulseTruthMode } from './types.structural';
import type {
  PulseCapabilityStatus,
  PulseFlowProjectionStatus,
  PulseExternalSignalSummary,
} from './types.capabilities';
import type { PulseCertification } from './types.evidence';

/** Pulse product vision shape. */
export interface PulseProductVision {
  /** Generated at property. */
  generatedAt: string;
  /** Truth mode property. */
  truthMode: PulseTruthMode;
  /** Evidence basis property. */
  evidenceBasis?: {
    observed: number;
    inferred: number;
    projected: number;
  };
  /** Current checkpoint property. */
  currentCheckpoint: {
    tier: number | null;
    status: PulseCertification['status'];
    score: number;
  };
  /** Projected checkpoint property. */
  projectedCheckpoint: {
    capabilityRealnessRatio: number;
    flowRealnessRatio: number;
    projectedProductionReadiness: 'red' | 'yellow' | 'green';
  };
  /** Current state summary property. */
  currentStateSummary: string;
  /** Projected product summary property. */
  projectedProductSummary: string;
  /** Inferred product identity property. */
  inferredProductIdentity?: string;
  /** Distance summary property. */
  distanceSummary: string;
  /** Promise to production delta property. */
  promiseToProductionDelta?: {
    declaredSurfaces: number;
    realSurfaces: number;
    partialSurfaces: number;
    latentSurfaces: number;
    phantomSurfaces: number;
    productFacingPhantomCapabilities?: number;
    systemPhantomCapabilities?: number;
    criticalGaps: string[];
  };
  /** External signal summary property. */
  externalSignalSummary?: PulseExternalSignalSummary;
  /** Surfaces property. */
  surfaces?: Array<{
    id: string;
    name: string;
    declaredByManifest: boolean;
    critical: boolean;
    status: PulseCapabilityStatus;
    truthMode: PulseTruthMode;
    completion: number;
    routePatterns: string[];
    capabilityIds: string[];
    flowIds: string[];
    blockers: string[];
  }>;
  /** Experiences property. */
  experiences?: Array<{
    id: string;
    name: string;
    status: PulseFlowProjectionStatus;
    truthMode: PulseTruthMode;
    completion: number;
    routePatterns: string[];
    capabilityIds: string[];
    flowIds: string[];
    blockers: string[];
    expectedOutcome: string;
  }>;
  /** Top blockers property. */
  topBlockers: string[];
}
