import { Injectable, Logger } from '@nestjs/common';
import type { OfferQuality } from './types';

interface OfferQualityInput {
  readonly offerId: string;
  readonly workspaceId: string;
  readonly conversionRate: number;
  readonly refundRate: number;
  readonly avgTicket: number;
  readonly commissionRate: number;
  readonly marketDemand: number;
  readonly saturationRisk: number;
}

const WEIGHTS = {
  conversionRate: 0.3,
  refundRatePenalty: 0.2,
  avgTicket: 0.15,
  commissionRate: 0.2,
  marketDemand: 0.1,
  saturationRiskPenalty: 0.05,
} as const;

const HIGH_TICKET_THRESHOLD = 200;
const LOW_REFUND_THRESHOLD = 0.05;
const MODERATE_REFUND_THRESHOLD = 0.15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeTicket(avgTicket: number): number {
  if (avgTicket <= 0) return 0;
  if (avgTicket >= HIGH_TICKET_THRESHOLD) return 1;
  return avgTicket / HIGH_TICKET_THRESHOLD;
}

function refundPenalty(refundRate: number): number {
  if (refundRate <= LOW_REFUND_THRESHOLD) return 1;
  if (refundRate >= MODERATE_REFUND_THRESHOLD) return 0;
  return 1 - (refundRate - LOW_REFUND_THRESHOLD) / (MODERATE_REFUND_THRESHOLD - LOW_REFUND_THRESHOLD);
}

function saturationPenalty(risk: number): number {
  return 1 - clamp(risk, 0, 1);
}

@Injectable()
export class OfferQualityScorerService {
  private readonly logger = new Logger(OfferQualityScorerService.name);

  score(input: OfferQualityInput): OfferQuality {
    const ticketScore = normalizeTicket(input.avgTicket);
    const refundScore = refundPenalty(input.refundRate);
    const satScore = saturationPenalty(input.saturationRisk);

    const overallScore = clamp(
      input.conversionRate * WEIGHTS.conversionRate +
        refundScore * WEIGHTS.refundRatePenalty +
        ticketScore * WEIGHTS.avgTicket +
        input.commissionRate * WEIGHTS.commissionRate +
        input.marketDemand * WEIGHTS.marketDemand +
        satScore * WEIGHTS.saturationRiskPenalty,
      0,
      1,
    );

    this.logger.debug(
      `Offer ${input.offerId} quality scored: ${overallScore.toFixed(3)}`,
    );

    return {
      offerId: input.offerId,
      workspaceId: input.workspaceId,
      overallScore: Math.round(overallScore * 1000) / 1000,
      conversionRate: input.conversionRate,
      refundRate: input.refundRate,
      avgTicket: input.avgTicket,
      commissionRate: input.commissionRate,
      marketDemand: input.marketDemand,
      saturationRisk: input.saturationRisk,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
