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
  /** Legacy human-required signals still observed from older artifacts. New outputs should be zero. */
  humanRequiredSignals: number;
  /** Signals requiring governed validation before mutation. */
  governedValidationSignals: number;
  /** Stale adapters property. */
  staleAdapters: number;
  /** Missing adapters property (required && (not_available || invalid)). */
  missingAdapters: number;
  /** Invalid adapters count (subset of missingAdapters where status==='invalid'). */
  invalidAdapters: number;
  /** Adapters skipped because they are optional and not configured (non-blocking). */
  optionalSkippedAdapters: number;
  /** Required adapters under the active profile. */
  requiredAdapters: number;
  /** Optional adapters under the active profile. */
  optionalAdapters: number;
  /** Adapters with observed proof basis. */
  observedAdapters: number;
  /** Required adapters currently blocking external reality closure. */
  blockingAdapters: number;
  /** Source names of missing required adapters. */
  missingAdaptersList: string[];
  /** Source names of stale required adapters. */
  staleAdaptersList: string[];
  /** Source names of invalid required adapters. */
  invalidAdaptersList: string[];
  /** Source names of optional adapters skipped (not_configured, not blocking). */
  optionalSkippedList: string[];
  /** Optional adapters that are unavailable but not blocking under the active profile. */
  optionalNotAvailableList: string[];
  /** Required adapter sources currently blocking external reality closure. */
  blockingAdaptersList: string[];
  /** Adapter proof-basis counts. */
  proofBasisCounts: Record<PulseExternalAdapterProofBasis, number>;
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

// Parity-gap types are co-located in a sibling module to keep this file under
// the architecture-guardrails size cap.  They are re-exported here so existing
// call sites (`from './types.capabilities'`) continue to work.
export type {
  PulseParityGap,
  PulseParityGapKind,
  PulseParityGapSeverity,
  PulseParityGapsArtifact,
  PulseParityGapsSummary,
} from './types.capabilities.parity';

