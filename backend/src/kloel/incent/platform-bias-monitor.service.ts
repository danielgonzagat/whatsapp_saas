import { Injectable } from '@nestjs/common';
import type { BiasLevel, BiasSource, PlatformBias } from './types';
import { biasLevelFromDelta, clamp, makeIncidentId } from './types';

/**
 * INCENT-004 — PlatformBiasMonitor.
 *
 * Audita peso de recomendação por receita interna da plataforma.
 * Compara o peso que a plataforma gostaria de dar (internalRevenueWeight)
 * com o peso justo (fairWeight). Quando há delta significativo,
 * sinaliza viés e pode aplicar mitigação.
 *
 * Gate: `platform-bias-monitor` — Camada XXXIV — log_only @ Onda 9.
 */
@Injectable()
export class PlatformBiasMonitorService {
  private static readonly MITIGATION_THRESHOLD = 0.08;
  private static readonly STRONG_MITIGATION_THRESHOLD = 0.2;

  private seq = 0;

  public audit(input: BiasAuditInput): PlatformBias {
    this.seq += 1;
    const fairWeight = this.computeFairWeight(input);
    const internalWeight = input.internalRevenueWeight ?? 0;
    const delta = internalWeight - fairWeight;

    const biasDetected = Math.abs(delta) > PlatformBiasMonitorService.MITIGATION_THRESHOLD;
    const level = biasLevelFromDelta(delta);
    const mitigationApplied =
      biasDetected && Math.abs(delta) >= PlatformBiasMonitorService.STRONG_MITIGATION_THRESHOLD;

    const source = this.classifyBiasSource(input);

    return {
      id: makeIncidentId('bias', this.seq),
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
      biasDetected,
      source,
      level,
      internalRevenueWeight: clamp(internalWeight, 0, 1),
      fairWeight: clamp(fairWeight, 0, 1),
      weightDelta: Number(delta.toFixed(4)),
      mitigationApplied,
      explanation: this.buildExplanation(level, delta, mitigationApplied, source),
      detectedAt: new Date().toISOString(),
    };
  }

  public auditBatch(inputs: readonly BiasAuditInput[]): readonly PlatformBias[] {
    return inputs.map((inp) => this.audit(inp));
  }

  public biasAlerts(audits: readonly PlatformBias[]): readonly PlatformBias[] {
    return audits.filter((a) => a.biasDetected);
  }

  public overallBiasScore(audits: readonly PlatformBias[]): number {
    if (audits.length === 0) {
      return 0;
    }
    const deltas = audits.map((a) => Math.abs(a.weightDelta));
    return deltas.reduce((sum, d) => sum + d, 0) / audits.length;
  }

  public dominanceRatio(audits: readonly PlatformBias[], source: BiasSource): number {
    const relevant = audits.filter((a) => a.source === source);
    if (relevant.length === 0) {
      return 0;
    }
    return relevant.filter((a) => a.biasDetected).length / relevant.length;
  }

  private computeFairWeight(input: BiasAuditInput): number {
    const weights = [
      input.userRelevance ?? 0.3,
      input.objectiveQuality ?? 0.25,
      input.competitiveLandscape ?? 0.2,
      input.userHistory ?? 0.15,
      input.thirdPartyRating ?? 0.1,
    ];
    return weights.reduce((a, b) => a + b, 0);
  }

  private classifyBiasSource(input: BiasAuditInput): BiasSource {
    if (input.biasSource) {
      return input.biasSource;
    }
    if (input.internalRevenueWeight && input.internalRevenueWeight > 0.5) {
      return 'internal_revenue';
    }
    if (input.exclusivePartner) {
      return 'exclusivity_clause';
    }
    if (input.marketplaceRanking) {
      return 'marketplace_ranking';
    }
    return 'commission_structure';
  }

  private buildExplanation(
    level: BiasLevel,
    delta: number,
    mitigated: boolean,
    source: BiasSource,
  ): string {
    const deltaPct = (Math.abs(delta) * 100).toFixed(1);
    const sourceLabel: Record<BiasSource, string> = {
      internal_revenue: 'receita interna da plataforma',
      commission_structure: 'estrutura de comissão',
      marketplace_ranking: 'ranking do marketplace',
      platform_lock_in: 'lock-in de plataforma',
      exclusivity_clause: 'cláusula de exclusividade',
    };
    const mitigatedText = mitigated ? ' Mitigação automática aplicada.' : '';
    return `Viés de nível [${level}] detectado (delta=${deltaPct}%) originado em ${sourceLabel[source] ?? source}.${mitigatedText}`;
  }
}

export interface BiasAuditInput {
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly internalRevenueWeight?: number;
  readonly userRelevance?: number;
  readonly objectiveQuality?: number;
  readonly competitiveLandscape?: number;
  readonly userHistory?: number;
  readonly thirdPartyRating?: number;
  readonly biasSource?: BiasSource;
  readonly exclusivePartner?: boolean;
  readonly marketplaceRanking?: boolean;
}
