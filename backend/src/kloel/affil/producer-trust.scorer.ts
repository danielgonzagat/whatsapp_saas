import { Injectable, Logger } from '@nestjs/common';
import type { ProducerTrust } from './types';

interface ProducerTrustInput {
  readonly producerId: string;
  readonly workspaceId: string;
  readonly paymentHistoryReliability: number;
  readonly communicationResponsiveness: number;
  readonly productQualityConsistency: number;
  readonly disputeResolutionRate: number;
  readonly productionStability: number;
}

const WEIGHTS = {
  paymentHistory: 0.3,
  communication: 0.15,
  productQuality: 0.25,
  disputeResolution: 0.15,
  productionStability: 0.15,
} as const;

const TRUST_THRESHOLD_LOW = 0.3;
const TRUST_THRESHOLD_HIGH = 0.7;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

@Injectable()
export class ProducerTrustScorerService {
  private readonly logger = new Logger(ProducerTrustScorerService.name);

  score(input: ProducerTrustInput): ProducerTrust {
    const trustScore = clamp(
      input.paymentHistoryReliability * WEIGHTS.paymentHistory +
        input.communicationResponsiveness * WEIGHTS.communication +
        input.productQualityConsistency * WEIGHTS.productQuality +
        input.disputeResolutionRate * WEIGHTS.disputeResolution +
        input.productionStability * WEIGHTS.productionStability,
      0,
      1,
    );

    this.logger.debug(
      `Producer ${input.producerId} trust scored: ${trustScore.toFixed(3)}`,
    );

    return {
      producerId: input.producerId,
      workspaceId: input.workspaceId,
      trustScore: Math.round(trustScore * 1000) / 1000,
      paymentHistoryReliability: input.paymentHistoryReliability,
      communicationResponsiveness: input.communicationResponsiveness,
      productQualityConsistency: input.productQualityConsistency,
      disputeResolutionRate: input.disputeResolutionRate,
      productionStability: input.productionStability,
      evaluatedAt: new Date().toISOString(),
    };
  }

  isTrustworthy(trust: ProducerTrust): boolean {
    return trust.trustScore >= TRUST_THRESHOLD_HIGH;
  }

  isUntrustworthy(trust: ProducerTrust): boolean {
    return trust.trustScore < TRUST_THRESHOLD_LOW;
  }

  getRiskLevel(trust: ProducerTrust): 'low' | 'medium' | 'high' {
    if (trust.trustScore >= TRUST_THRESHOLD_HIGH) return 'low';
    if (trust.trustScore >= TRUST_THRESHOLD_LOW) return 'medium';
    return 'high';
  }
}
