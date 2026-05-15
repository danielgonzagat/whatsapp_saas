import type { AbiValence, AbiTruthMode } from '../abi/abi-schema';

export interface SpineSignal {
  readonly eventName: string;
  readonly workspaceId?: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly truthMode: AbiTruthMode;
  readonly valence?: AbiValence;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
  readonly correlationId?: string;
}

export interface Hypothesis {
  readonly id: string;
  readonly workspaceId: string;
  readonly statement: string;
  readonly domain: string;
  readonly sourceEventId: string;
  readonly confidence: number;
  readonly truthMode: AbiTruthMode;
  readonly generatedAt: string;
  readonly status: 'pending' | 'authorized' | 'rejected' | 'running' | 'evaluated';
  readonly marketEntryId?: string;
  readonly commercialStage?: 'validacao' | 'tracao' | 'crescimento' | 'maturidade' | 'otimizacao';
  readonly businessModel?: string;
  readonly flagshipJourney?: string;
  readonly payablePain?: string;
}

export type CommercialRiskClass = 'R1' | 'R2' | 'R3' | 'R4';
export type ProofTargetLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6';
export type AutonomyMode = 'alone' | 'approval' | 'escalate' | 'prohibited';

export interface MicroExperiment {
  readonly id: string;
  readonly hypothesisId: string;
  readonly workspaceId: string;
  readonly description: string;
  readonly riskAssessment: 'safe' | 'normal' | 'high';
  readonly targetMetric: string;
  readonly evidenceThreshold: number;
  readonly maxDurationMs: number;
  readonly designedAt: string;
  readonly correlationId: string;
  readonly commercialWork?: string;
  readonly riskClass?: CommercialRiskClass;
  readonly autonomyMode?: AutonomyMode;
  readonly proofLevelTarget?: ProofTargetLevel;
  readonly validationScene?: string;
  readonly noFaithProofSignal?: string;
  readonly leadLeavesBetterCheck?: string;
}

export interface AuthorizationRequest {
  readonly experimentId: string;
  readonly hypothesisId: string;
  readonly workspaceId: string;
  readonly riskAssessment: 'safe' | 'normal' | 'high';
  readonly requestedAt: string;
  readonly reason: string;
}

export interface AuthorizationDecision {
  readonly request: AuthorizationRequest;
  readonly authorized: boolean;
  readonly authorityLevel: 'advisory' | 'tool_limited' | 'human_required';
  readonly reason: string;
  readonly decidedAt: string;
}

export interface ExperimentRun {
  readonly id: string;
  readonly experimentId: string;
  readonly hypothesisId: string;
  readonly workspaceId: string;
  readonly correlationId: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly error: string | null;
}

export interface Observation {
  readonly id: string;
  readonly runId: string;
  readonly experimentId: string;
  readonly workspaceId: string;
  readonly correlationId: string;
  readonly metricName: string;
  readonly baselineValue: number;
  readonly observedValue: number;
  readonly delta: number;
  readonly confidence: number;
  readonly truthMode: AbiTruthMode;
  readonly evidenceCount: number;
  readonly observedAt: string;
}

export type ProofVerdict = 'confirmed' | 'refuted' | 'inconclusive';

export interface ProofEvaluation {
  readonly experimentId: string;
  readonly hypothesisId: string;
  readonly workspaceId: string;
  readonly correlationId: string;
  readonly verdict: ProofVerdict;
  readonly confidence: number;
  readonly evidenceCount: number;
  readonly meanDelta: number;
  readonly reason: string;
  readonly evaluatedAt: string;
}

export interface BeliefUpdate {
  readonly id: string;
  readonly workspaceId: string;
  readonly subject: string;
  readonly predicate: string;
  readonly context: Record<string, unknown>;
  readonly priorMean: number;
  readonly posteriorMean: number;
  readonly evidenceCount: number;
  readonly verdict: ProofVerdict;
  readonly correlationId: string;
  readonly updatedAt: string;
}

export interface DiscoveryNarrative {
  readonly id: string;
  readonly workspaceId: string;
  readonly hypothesisId: string;
  readonly correlationId: string;
  readonly headline: string;
  readonly body: string;
  readonly verdict: ProofVerdict;
  readonly confidence: number;
  readonly evidenceCount: number;
  readonly generatedAt: string;
}
