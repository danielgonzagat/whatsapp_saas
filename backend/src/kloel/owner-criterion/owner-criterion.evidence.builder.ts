import { Injectable } from '@nestjs/common';
import type {
  ApprovalThresholdObservation,
  CorrectionObservation,
  DecisionObservation,
  EthicalLineObservation,
  RiskToleranceObservation,
  ToneObservation,
} from './owner-criterion.types';

/**
 * UTP-OWNER-CRIT-008 — Builds owner-criterion evidence bundles.
 *
 * Pure: takes observations from the six observers and packages them as
 * a structured evidence bundle that can be projected into the ABI or
 * shown in an audit interface.
 */

export interface OwnerCriterionEvidenceBundle {
  readonly workspaceId: string;
  readonly builtAt: string;
  readonly decisionEvidence: readonly DecisionObservation[];
  readonly correctionEvidence: readonly CorrectionObservation[];
  readonly toneEvidence: readonly ToneObservation[];
  readonly riskEvidence: readonly RiskToleranceObservation[];
  readonly ethicalEvidence: readonly EthicalLineObservation[];
  readonly approvalEvidence: readonly ApprovalThresholdObservation[];
  readonly aggregateConfidence: number;
  readonly observationCount: number;
}

@Injectable()
export class OwnerCriterionEvidenceBuilder {
  public build(input: {
    readonly workspaceId: string;
    readonly decisions: readonly DecisionObservation[];
    readonly corrections: readonly CorrectionObservation[];
    readonly tones: readonly ToneObservation[];
    readonly risks: readonly RiskToleranceObservation[];
    readonly ethicals: readonly EthicalLineObservation[];
    readonly approvals: readonly ApprovalThresholdObservation[];
    readonly nowIso?: string;
  }): OwnerCriterionEvidenceBundle {
    const all = [
      ...input.decisions,
      ...input.corrections,
      ...input.tones,
      ...input.risks,
      ...input.ethicals,
      ...input.approvals,
    ];
    const observationCount = all.length;
    const aggregateConfidence =
      observationCount === 0
        ? 0
        : all.reduce((s, o) => s + (o.confidence ?? 0), 0) / observationCount;

    return {
      workspaceId: input.workspaceId,
      builtAt: input.nowIso ?? new Date().toISOString(),
      decisionEvidence: input.decisions,
      correctionEvidence: input.corrections,
      toneEvidence: input.tones,
      riskEvidence: input.risks,
      ethicalEvidence: input.ethicals,
      approvalEvidence: input.approvals,
      aggregateConfidence,
      observationCount,
    };
  }
}
