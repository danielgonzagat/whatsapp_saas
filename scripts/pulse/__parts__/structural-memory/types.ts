import type {
  AttemptStatus,
  LegacyUnitMemoryStatus,
  LearnedPattern,
  MemoryEntry,
  StructuralMemoryState,
  UnitMemory,
  UnitMemoryStatus,
} from '../../types.structural-memory';

export type StrategyFingerprintFields =
  | 'strategyFingerprints'
  | 'strategyFingerprintCounts'
  | 'lastStrategyFingerprint'
  | 'repeatedStrategyAttempts'
  | 'avoidStrategyFingerprint';

export type StructuralAdjudicationStatus =
  | 'confirmed'
  | 'false_positive'
  | 'accepted_risk'
  | 'stale';

export type StructuralMemoryExtensions = {
  failedStrategyFingerprints: string[];
  failedStrategyFingerprintCounts: Record<string, number>;
  lastFailedStrategyFingerprint: string | null;
  repeatedFailedStrategyAttempts: number;
  avoidFailedStrategyFingerprint: string | null;
  adjudicationStatus: StructuralAdjudicationStatus | null;
  adjudicationProof: string | null;
};

export type ExtendedUnitMemory = Omit<UnitMemory, keyof StructuralMemoryExtensions> &
  Partial<StructuralMemoryExtensions>;

export type LegacyUnitMemory = Omit<UnitMemory, 'status'> &
  Partial<Pick<UnitMemory, StrategyFingerprintFields>> &
  Partial<StructuralMemoryExtensions> & {
    status: LegacyUnitMemoryStatus;
  };

export type LegacyStructuralMemoryState = Omit<StructuralMemoryState, 'units'> & {
  units: LegacyUnitMemory[];
};
