export type MindJson = Record<string, unknown>;

export interface MindBelief {
  id?: string;
  workspaceId: string;
  subject: string;
  predicate: string;
  context: MindJson;
  mean: number;
  variance: number;
  samples: number;
  alpha: number;
  beta: number;
  lastUpdate?: Date;
  updatedAt?: Date;
  createdAt?: Date;
}

export interface MindPrediction {
  actual?: number | null;
  context: MindJson;
  createdAt?: Date;
  deadline: Date;
  horizonSec: number;
  id?: string;
  predictedMean: number;
  predictedVariance: number;
  predicate: string;
  resolvedAt?: Date | null;
  subject: string;
  surprise?: number | null;
  updatedAt?: Date;
  workspaceId: string;
}

export interface MindPerceptEvent {
  kind: string;
  occurredAt: Date;
  payload: MindJson;
  subject: string;
  workspaceId: string;
}

export interface MindContext {
  features: MindJson;
  subject: string;
  workspaceId: string;
}

export interface MindTick {
  beliefsUpdated: number;
  decisionsMade: number;
  durationMs: number;
  perceived: number;
  predicted: number;
  resolved: number;
  surpriseTotal: number;
  workspaceId: string;
}

export interface MindActionCandidate {
  action: string;
  beliefMean: number;
  beliefVariance: number;
  pragmatic: number;
  epistemic: number;
  efe: number;
  uncertaintyAtChoice: number;
}

export interface MindPolicyDecision {
  baseline: string;
  baselineAction: string;
  calcSteps: MindPolicyCalcStep[];
  candidates: MindActionCandidate[];
  chosen: string;
  context: MindJson;
  decisionType: string;
  epsilon: number;
  fallbackActive: boolean;
  fallbackReason: string | null;
  outcome?: number | null;
  baselineOutcome?: number | null;
  outcomeKey?: string;
  reasonInternal: string;
  resolvedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  subject: string;
  utilityFail: number;
  utilitySuccess: number;
  workspaceId: string;
}

export interface MindPolicyCalcStep {
  action: string;
  beliefMean: number;
  beliefVariance: number;
  pragmatic: number;
  epistemic: number;
  efe: number;
  formula: string;
}

export interface MindPolicyOption {
  action: string;
  context: MindJson;
  predicate: string;
}
