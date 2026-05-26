import { Injectable } from '@nestjs/common';
import { DecisionOutcomeService } from '../kloel/decision-outcome.service';
// ── Outcome success classification (canonical in MindLiftReportService) ────

const OUTCOME_WEIGHTS: Record<string, number> = {
  'inbound.received': 0.5,
  'payment.succeeded': 1.0,
  'checkout.abandoned': -0.3,
  'coupon.redeemed': 0.7,
  'conversation.handed_off': 0.6,
  'contact.opted_out': -1.0,
  'payment.refunded': -0.5,
  'subscription.canceled': -0.8,
  'inbound.silent_24h': -0.1,
};

function isSingleSuccess(outcomeName: string | null): boolean {
  const weight = outcomeName ? (OUTCOME_WEIGHTS[outcomeName] ?? 0) : 0;
  return weight >= 0.3;
}
// ── Types ─────────────────────────────────────────────────────────────────

export interface AutonomyAdvice {
  adjustments: number;
  reasoning: string[];
}

interface DecisionTypeStats {
  decisionType: string;
  total: number;
  successCount: number;
  successRate: number;
  z: number;
}
// ── Constants ─────────────────────────────────────────────────────────────

const MIN_SAMPLES = 30;
const Z_THRESHOLD = 1.96;
const NULL_HYPOTHESIS_P = 0.5;
const LOOKBACK_DAYS = 14;
/**
 * Reads MindLiftReportService metrics per decision type and assesses
 * whether CIA autonomy aggressiveness should be adjusted.
 *
 * Advisory-only in this slice — does NOT call updateWorkspaceAutonomy.
 */
@Injectable()
export class CiaAutonomyAdvisorService {
  constructor(private readonly decisionOutcome: DecisionOutcomeService) {}
  async analyzeAndAdvise(workspaceId: string): Promise<AutonomyAdvice> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400 * 1000);
    const rows = await this.decisionOutcome.findAllClosedSinceForWorkspace(
      workspaceId,
      since,
    );

    const grouped = new Map<
      string,
      { total: number; successCount: number }
    >();

    for (const row of rows) {
      const entry = grouped.get(row.decisionType) ?? {
        total: 0,
        successCount: 0,
      };
      entry.total += 1;
      if (isSingleSuccess(row.outcomeName ?? null)) {
        entry.successCount += 1;
      }
      grouped.set(row.decisionType, entry);
    }

    const stats: DecisionTypeStats[] = [];

    for (const [decisionType, { total, successCount }] of grouped) {
      if (total < MIN_SAMPLES) continue;

      const successRate = successCount / total;
      const se = Math.sqrt(
        (NULL_HYPOTHESIS_P * (1 - NULL_HYPOTHESIS_P)) / total,
      );
      const z = (successRate - NULL_HYPOTHESIS_P) / se;

      stats.push({ decisionType, total, successCount, successRate, z });
    }

    const reasoning: string[] = [];
    let adjustments = 0;

    for (const s of stats) {
      if (s.successRate > NULL_HYPOTHESIS_P && s.z >= Z_THRESHOLD) {
        adjustments += 1;
        reasoning.push(
          `INCREASE ${s.decisionType}: successRate=${(s.successRate * 100).toFixed(1)}%, ` +
            `n=${s.total}, z=${s.z.toFixed(2)} ≥ ${Z_THRESHOLD}`,
        );
      } else if (s.successRate < NULL_HYPOTHESIS_P && s.z <= -Z_THRESHOLD) {
        adjustments += 1;
        reasoning.push(
          `DECREASE ${s.decisionType}: successRate=${(s.successRate * 100).toFixed(1)}%, ` +
            `n=${s.total}, z=${s.z.toFixed(2)} ≤ ${-Z_THRESHOLD}`,
        );
      } else {
        reasoning.push(
          `NO_CHANGE ${s.decisionType}: successRate=${(s.successRate * 100).toFixed(1)}%, ` +
            `n=${s.total}, z=${s.z.toFixed(2)} (not significant)`,
        );
      }
    }

    return { adjustments, reasoning };
  }
}
