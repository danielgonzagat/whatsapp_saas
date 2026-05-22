import { Injectable } from '@nestjs/common';
import type { RuntimeMetric, CapabilityEntry, RTierDelta, Gap } from './evol.types';
import { DOMAIN_RISK_PROFILES, resolveDomain, commercialImpactWeight, clamp } from './evol.types';

/**
 * GapDetectorService — observa runtime metrics, R-tier deltas e capability
 * registry para detectar gaps de capacidade propria do Kloel.
 *
 * Sinais detectaveis:
 *   - Capability declarada como operational (tier_1 ou tier_2) mas com
 *     evidenceScore < 0.3
 *   - Capability em tier_3_facade ou tier_4_shell (sempre gap)
 *   - RTierDelta com direction 'downgraded'
 *   - RuntimeMetric acima de threshold (ex: payment failed rate alta)
 *
 * Filtragem:
 *   - confidence minima de 0.3
 *   - dominio deve existir em DOMAIN_RISK_PROFILES
 *   - truthMode sempre 'observed'
 */

export interface GapDetectionInput {
  readonly runtimeMetrics: readonly RuntimeMetric[];
  readonly capabilities: readonly CapabilityEntry[];
  readonly rTierDeltas: readonly RTierDelta[];
}

@Injectable()
export class GapDetectorService {
  private gapCounter = 0;

  detect(input: GapDetectionInput): readonly Gap[] {
    const now = new Date().toISOString();
    const gaps: Gap[] = [];

    for (const metric of input.runtimeMetrics) {
      const domain = resolveDomain(metric.name);
      if (!domain) continue;

      const profile = DOMAIN_RISK_PROFILES[domain];
      if (!profile) continue;

      if (metric.value <= metric.threshold) continue;

      const confidence = clamp(metric.value, 0, 1);
      if (confidence < 0.3) continue;

      this.gapCounter += 1;

      gaps.push({
        id: `gap-${metric.workspaceId}-${this.gapCounter}`,
        workspaceId: metric.workspaceId,
        domain,
        description: `Runtime metric "${metric.name}" exceeded threshold (${metric.value} > ${metric.threshold})`,
        severity: profile.severity,
        commercialImpact: profile.impact,
        estimatedRevenueRiskCents: Math.round(
          profile.baseRiskCents * confidence * commercialImpactWeight(profile.impact),
        ),
        detectedAt: now,
        sourceEvidence: [`metric:${metric.name}`, `value:${metric.value}`],
        confidence,
        truthMode: 'observed',
      });
    }

    for (const capability of input.capabilities) {
      const domain = resolveDomain(capability.domain);
      if (!domain) continue;

      const profile = DOMAIN_RISK_PROFILES[domain];
      if (!profile) continue;

      if (capability.evidenceScore >= 0.3) continue;

      const confidence = 1.0 - capability.evidenceScore;
      if (confidence < 0.3) continue;

      this.gapCounter += 1;

      gaps.push({
        id: `gap-${capability.capabilityId}-${this.gapCounter}`,
        workspaceId: 'global',
        domain,
        description: `Capability "${capability.capabilityId}" declared as ${capability.declaredTier} but evidence score is ${capability.evidenceScore}`,
        severity: profile.severity,
        commercialImpact: profile.impact,
        estimatedRevenueRiskCents: Math.round(
          profile.baseRiskCents * confidence * commercialImpactWeight(profile.impact),
        ),
        detectedAt: now,
        sourceEvidence: [...capability.evidence],
        confidence,
        truthMode: 'observed',
      });
    }

    for (const delta of input.rTierDeltas) {
      const domain = resolveDomain(delta.module);
      if (!domain) continue;

      const profile = DOMAIN_RISK_PROFILES[domain];
      if (!profile) continue;

      if (delta.direction !== 'downgraded') continue;

      const severity: 'critical' | 'high' =
        delta.currentTier === 'tier_4_shell' ? 'critical' : 'high';

      this.gapCounter += 1;

      gaps.push({
        id: `gap-${delta.module}-${this.gapCounter}`,
        workspaceId: delta.workspaceId,
        domain,
        description: `R-tier downgrade detected for module "${delta.module}": ${delta.previousTier} -> ${delta.currentTier}. Reason: ${delta.reason}`,
        severity,
        commercialImpact: profile.impact,
        estimatedRevenueRiskCents: Math.round(profile.baseRiskCents * 0.95 * commercialImpactWeight(profile.impact)),
        detectedAt: now,
        sourceEvidence: [`delta:${delta.module}`, `previous:${delta.previousTier}`, `current:${delta.currentTier}`],
        confidence: 0.95,
        truthMode: 'observed',
      });
    }

    return gaps.sort((a, b) => b.estimatedRevenueRiskCents - a.estimatedRevenueRiskCents);
  }

  estimateTotalRisk(gaps: readonly Gap[]): number {
    return gaps.reduce((sum, g) => sum + g.estimatedRevenueRiskCents, 0);
  }

  resetCounter(): void {
    this.gapCounter = 0;
  }
}
