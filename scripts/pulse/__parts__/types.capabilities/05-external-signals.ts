import type { PulseConvergenceOwnerLane } from '../../types.gate-failure';
import type { PulseScopeExecutionMode, PulseTruthMode } from '../../types.truth';
import type {
  PulseExternalAdapterProofBasis,
  PulseExternalAdapterRequiredness,
  PulseExternalAdapterRequirement,
  PulseExternalAdapterStatus,
  PulseExternalSignalSource,
  PulseExternalSignalType,
} from './01-primitives';

export interface PulseSignal {
  id: string;
  type: PulseExternalSignalType;
  source: PulseExternalSignalSource;
  truthMode: Extract<PulseTruthMode, 'observed' | 'inferred'>;
  severity: number;
  impactScore: number;
  confidence: number;
  summary: string;
  observedAt: string | null;
  relatedFiles: string[];
  routePatterns: string[];
  tags: string[];
  capabilityIds: string[];
  flowIds: string[];
  recentChangeRefs: string[];
  ownerLane: PulseConvergenceOwnerLane;
  executionMode: PulseScopeExecutionMode;
  governanceDisposition?: 'observation_only' | 'governed_validation';
  protectedByGovernance: boolean;
  validationTargets: string[];
  rawRef?: string | null;
}

export interface PulseExternalAdapterSnapshot {
  source: PulseExternalSignalSource;
  sourcePath: string | null;
  executed: boolean;
  status: PulseExternalAdapterStatus;
  requiredness: PulseExternalAdapterRequiredness;
  requirement: PulseExternalAdapterRequirement;
  required: boolean;
  observed: boolean;
  blocking: boolean;
  proofBasis: PulseExternalAdapterProofBasis;
  missingReason: string | null;
  generatedAt: string;
  syncedAt: string | null;
  freshnessMinutes: number | null;
  reason: string;
  signals: PulseSignal[];
}

export interface PulseExternalSignalSummary {
  totalSignals: number;
  runtimeSignals: number;
  changeSignals: number;
  dependencySignals: number;
  highImpactSignals: number;
  mappedSignals: number;
  humanRequiredSignals: number;
  governedValidationSignals: number;
  staleAdapters: number;
  missingAdapters: number;
  invalidAdapters: number;
  optionalSkippedAdapters: number;
  requiredAdapters: number;
  optionalAdapters: number;
  observedAdapters: number;
  blockingAdapters: number;
  missingAdaptersList: string[];
  staleAdaptersList: string[];
  invalidAdaptersList: string[];
  optionalSkippedList: string[];
  optionalNotAvailableList: string[];
  blockingAdaptersList: string[];
  proofBasisCounts: Record<PulseExternalAdapterProofBasis, number>;
  bySource: Record<PulseExternalSignalSource, number>;
}

export interface PulseExternalSignalState {
  generatedAt: string;
  truthMode: Extract<PulseTruthMode, 'observed' | 'inferred'>;
  summary: PulseExternalSignalSummary;
  adapters: PulseExternalAdapterSnapshot[];
  signals: PulseSignal[];
}
