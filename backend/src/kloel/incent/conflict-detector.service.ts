import { Injectable } from '@nestjs/common';
import type { ConflictDetection, ConflictKind, ConflictSeverity } from './types';
import { makeIncidentId } from './types';

/**
 * INCENT-002 — ConflictDetector.
 *
 * Detecta conflitos de interesse em recomendações cruzadas.
 * Varre vínculos financeiros, preferência de plataforma, viés de
 * comissão, parcerias exclusivas, propriedade cruzada, alavancagem
 * de dados e self-dealing.
 *
 * Cada fonte de conflito é avaliada com severidade e evidência.
 */
@Injectable()
export class ConflictDetectorService {
  private seq = 0;

  public detect(input: ConflictInput): ConflictDetection {
    this.seq += 1;
    const conflicts = this.analyzeParties(input);

    const worstSeverity = conflicts.reduce<ConflictSeverity>(
      (worst, c) => this.worseSeverity(worst, c.severity),
      'none',
    );

    const primaryConflict = conflicts[0];

    return {
      id: makeIncidentId('cfl', this.seq),
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
      conflictDetected: worstSeverity !== 'none',
      kind: primaryConflict?.kind ?? 'financial_interest',
      severity: worstSeverity,
      affectedParties: conflicts.flatMap((c) => c.parties),
      evidence: conflicts.flatMap((c) => c.evidence),
      detectedAt: new Date().toISOString(),
    };
  }

  public detectBatch(
    inputs: readonly ConflictInput[],
  ): readonly ConflictDetection[] {
    return inputs.map((inp) => this.detect(inp));
  }

  public hasAnyConflict(detections: readonly ConflictDetection[]): boolean {
    return detections.some((d) => d.conflictDetected);
  }

  public structuralConflicts(
    detections: readonly ConflictDetection[],
  ): readonly ConflictDetection[] {
    return detections.filter((d) => d.severity === 'structural');
  }

  private analyzeParties(
    input: ConflictInput,
  ): readonly PartyConflict[] {
    const results: PartyConflict[] = [];

    const parties = input.involvedParties ?? [];

    if (input.kloelHasOwnership) {
      results.push({
        kind: 'cross_ownership',
        severity: 'structural',
        parties,
        evidence: ['kloel_owns_or_owned_by_recommended_party'],
      });
    }

    if (input.kloelReceivesCommission) {
      results.push({
        kind: 'commission_bias',
        severity: 'actual',
        parties,
        evidence: [`commission_on_recommendation_${input.commissionRate ?? 'unknown'}`],
      });
    }

    if (input.exclusivePartner) {
      results.push({
        kind: 'exclusive_partnership',
        severity: this.exclusiveSeverity(input),
        parties,
        evidence: ['exclusive_partnership_with_recommended_party'],
      });
    }

    if (input.platformPreference) {
      results.push({
        kind: 'platform_preference',
        severity: 'potential',
        parties,
        evidence: ['recommendation_favors_integrated_platform'],
      });
    }

    if (input.dataLeverage) {
      results.push({
        kind: 'data_leverage',
        severity: 'potential',
        parties,
        evidence: ['recommendation_uses_exclusive_kloel_data'],
      });
    }

    if (this.isSelfDealing(input)) {
      results.push({
        kind: 'self_dealing',
        severity: 'structural',
        parties,
        evidence: ['kloel_recommending_kloel_service'],
      });
    }

    return results;
  }

  private exclusiveSeverity(input: ConflictInput): ConflictSeverity {
    return input.kloelReceivesCommission ? 'structural' : 'actual';
  }

  private isSelfDealing(input: ConflictInput): boolean {
    return input.recommendationId.toLowerCase().includes('kloel') ||
      (input.involvedParties ?? []).some(
        (p) => p.toLowerCase() === 'kloel',
      );
  }

  private worseSeverity(a: ConflictSeverity, b: ConflictSeverity): ConflictSeverity {
    const order: Record<ConflictSeverity, number> = {
      structural: 4,
      actual: 3,
      potential: 2,
      none: 0,
    };
    return order[a] >= order[b] ? a : b;
  }
}

interface PartyConflict {
  readonly kind: ConflictKind;
  readonly severity: ConflictSeverity;
  readonly parties: readonly string[];
  readonly evidence: readonly string[];
}

export interface ConflictInput {
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly involvedParties?: readonly string[];
  readonly kloelHasOwnership?: boolean;
  readonly kloelReceivesCommission?: boolean;
  readonly commissionRate?: number;
  readonly exclusivePartner?: boolean;
  readonly platformPreference?: boolean;
  readonly dataLeverage?: boolean;
}
