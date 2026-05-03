import type {
  OperationalEvidenceKind,
  RuntimeSignal,
  SignalSource,
} from '../../types.runtime-fusion';

export interface StructuralQueueInfluence {
  promotedUnitIds: Set<string>;
  suppressedUnitIds: Set<string>;
  deprioritizedUnitIds: Set<string>;
  strategyByUnitId: Map<string, string>;
  runtimeRealityByUnitId: Map<string, RuntimeRealityUnitMetadata>;
}

export interface RuntimeRealityUnitMetadata {
  unitId: string;
  rankScore: number;
  primarySignalId: string;
  primaryEvidenceKind: OperationalEvidenceKind;
  primarySource: SignalSource;
  evidenceMode: string;
  impactScore: number;
  confidence: number;
  affectedCapabilities: string[];
  affectedFlows: string[];
  reason: string;
}

export function emptyStructuralQueueInfluence(): StructuralQueueInfluence {
  return {
    promotedUnitIds: new Set<string>(),
    suppressedUnitIds: new Set<string>(),
    deprioritizedUnitIds: new Set<string>(),
    strategyByUnitId: new Map<string, string>(),
    runtimeRealityByUnitId: new Map<string, RuntimeRealityUnitMetadata>(),
  };
}
