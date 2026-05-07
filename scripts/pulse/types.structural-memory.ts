// PULSE — Wave 7: Structural Memory Engine
// Type definitions for unit-level memory with learning.

export type AttemptStatus = 'success' | 'failed' | 'regression' | 'blocked' | 'timeout';

/** Individual attempt log entry — the atomic audit record. */
export interface MemoryEntry {
  id: string;
  timestamp: string;
  unit: string;
  strategy: string;
  strategyFingerprint?: string;
  result: AttemptStatus;
  evidence: string;
  falsePositive: boolean;
}

export type UnitMemoryStatus = 'active' | 'escalated_validation' | 'resolved' | 'archived';

export type LegacyUnitMemoryStatus = UnitMemoryStatus | 'needs_human_review';

export interface UnitMemory {
  unitId: string;
  attempts: number;
  lastAttempt: string;
  failedStrategies: string[];
  successfulStrategies: string[];
  strategyFingerprints?: string[];
  strategyFingerprintCounts?: Record<string, number>;
  lastStrategyFingerprint?: string | null;
  repeatedStrategyAttempts?: number;
  avoidStrategyFingerprint?: string | null;
  lastFailure: string | null;
  repeatedFailures: number;
  status: UnitMemoryStatus;
  recommendedStrategy: string | null;
  falsePositive: boolean;
  fpProof: string | null;
}

export interface LearnedPattern {
  pattern: string;
  successRate: number;
  applicableTo: string[];
}

export interface StructuralMemoryState {
  generatedAt: string;
  summary: {
    totalUnits: number;
    activeUnits: number;
    escalatedValidationUnits: number;
    resolvedUnits: number;
    falsePositives: number;
    learnedStrategies: number;
  };
  units: UnitMemory[];
  learnedPatterns: LearnedPattern[];
}
