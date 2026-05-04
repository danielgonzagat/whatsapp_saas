import type { PulseStructuralRole, PulseTruthMode } from '../../types.truth';
import type { PulseFlowProjectionStatus } from './01-primitives';
import type { PulseCapabilityDoD } from './02-maturity-dod';

export interface PulseFlowProjectionItem {
  id: string;
  name: string;
  truthMode: PulseTruthMode;
  status: PulseFlowProjectionStatus;
  confidence: number;
  startNodeIds: string[];
  endNodeIds: string[];
  routePatterns: string[];
  capabilityIds: string[];
  rolesPresent: PulseStructuralRole[];
  missingLinks: string[];
  distanceToReal: number;
  evidenceSources: string[];
  blockingReasons: string[];
  validationTargets: string[];
  dod: PulseCapabilityDoD;
}

export interface PulseFlowProjectionSummary {
  totalFlows: number;
  realFlows: number;
  partialFlows: number;
  latentFlows: number;
  phantomFlows: number;
}

export interface PulseFlowProjection {
  generatedAt: string;
  summary: PulseFlowProjectionSummary;
  flows: PulseFlowProjectionItem[];
}
