import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OfferSwitch } from './types';
import { clamp } from '../../common/math';

interface OfferSwitchInput {
  readonly workspaceId: string;
  readonly currentOfferId: string;
  readonly candidateOffers: readonly CandidateOffer[];
  readonly currentOfferPerformance: OfferPerformance;
}

interface CandidateOffer {
  readonly offerId: string;
  readonly commissionRate: number;
  readonly conversionRate: number;
  readonly avgTicket: number;
  readonly refundRate: number;
  readonly marketDemand: number;
}

interface OfferPerformance {
  readonly conversionRate: number;
  readonly refundRate: number;
  readonly avgTicket: number;
  readonly monthlyRevenue: number;
  readonly trendDirection: 'up' | 'stable' | 'down';
}

const MIN_IMPROVEMENT_RATIO = 0.1;
const CONVERSION_WEIGHT = 0.35;
const COMMISSION_WEIGHT = 0.3;
const TICKET_WEIGHT = 0.15;
const REFUND_WEIGHT = 0.1;
const DEMAND_WEIGHT = 0.1;

@Injectable()
export class OfferSwitchSuggesterService {
  private readonly logger = new Logger(OfferSwitchSuggesterService.name);

  suggest(input: OfferSwitchInput): readonly OfferSwitch[] {
    if (input.candidateOffers.length === 0) {
      return [];
    }

    const currentScore = this.scoreOffer(input.currentOfferPerformance);
    const suggestions: OfferSwitch[] = [];

    for (const candidate of input.candidateOffers) {
      const candidateScore = this.scoreCandidate(candidate);
      const improvement = candidateScore > 0
        ? (candidateScore - currentScore) / candidateScore
        : 0;

      if (improvement >= MIN_IMPROVEMENT_RATIO) {
        const riskLevel = this.assessRisk(input.currentOfferPerformance, candidate);
        const reason = this.buildReason(input.currentOfferPerformance, candidate, improvement);

        suggestions.push({
          id: `osw_${randomUUID()}`,
          workspaceId: input.workspaceId,
          currentOfferId: input.currentOfferId,
          suggestedOfferId: candidate.offerId,
          reason,
          expectedImprovement: Math.round(improvement * 1000) / 1000,
          riskLevel,
          suggestedAt: new Date().toISOString(),
        });
      }
    }

    this.logger.debug(
      `Generated ${suggestions.length} offer switch suggestions from ${input.candidateOffers.length} candidates`,
    );

    return suggestions;
  }

  private scoreOffer(perf: OfferPerformance): number {
    const trendBonus = perf.trendDirection === 'up' ? 0.1 : perf.trendDirection === 'down' ? -0.1 : 0;
    return clamp(
      perf.conversionRate * CONVERSION_WEIGHT +
        (1 - perf.refundRate) * REFUND_WEIGHT +
        trendBonus,
      0,
      1,
    );
  }

  private scoreCandidate(candidate: CandidateOffer): number {
    return clamp(
      candidate.conversionRate * CONVERSION_WEIGHT +
        candidate.commissionRate * COMMISSION_WEIGHT +
        Math.min(candidate.avgTicket / 500, 1) * TICKET_WEIGHT +
        (1 - candidate.refundRate) * REFUND_WEIGHT +
        candidate.marketDemand * DEMAND_WEIGHT,
      0,
      1,
    );
  }

  private assessRisk(
    current: OfferPerformance,
    candidate: CandidateOffer,
  ): 'low' | 'medium' | 'high' {
    if (candidate.refundRate > 0.2 || current.trendDirection === 'up') {return 'high';}
    if (candidate.conversionRate < 0.02 || candidate.marketDemand < 0.4) {return 'medium';}
    return 'low';
  }

  private buildReason(
    current: OfferPerformance,
    candidate: CandidateOffer,
    improvement: number,
  ): string {
    const pctImprovement = (improvement * 100).toFixed(1);
    if (current.trendDirection === 'down') {
      return `Current offer is declining. Candidate offers ${pctImprovement}% better performance with ${(candidate.commissionRate * 100).toFixed(1)}% commission.`;
    }
    if (candidate.commissionRate > 0.3) {
      return `High-commission opportunity (${(candidate.commissionRate * 100).toFixed(1)}%) with ${pctImprovement}% expected improvement.`;
    }
    return `Candidate shows ${pctImprovement}% better projected performance with ${(candidate.conversionRate * 100).toFixed(1)}% conversion rate.`;
  }
}
