import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import type { ProducerTrustInput, ProducerTrustOutput } from './affil.types';
import { clamp } from '../../common/math';

const WEIGHTS = {
  paymentReliability: 0.35,
  refundResolutionTime: 0.20,
  complianceHistory: 0.25,
  communicationScore: 0.20,
} as const;

@Injectable()
export class ProducerTrustScorerService {
  private readonly logger = StructuredLogger.from(ProducerTrustScorerService.name);

  score(producer: ProducerTrustInput): ProducerTrustOutput {
    const payment = clamp(producer.paymentReliability, 0, 1);
    const refundSpeed = 1 - clamp(producer.refundResolutionTime, 0, 1);
    const compliance = clamp(producer.complianceHistory, 0, 1);
    const communication = clamp(producer.communicationScore, 0, 1);

    const rawScore =
      payment * WEIGHTS.paymentReliability +
      refundSpeed * WEIGHTS.refundResolutionTime +
      compliance * WEIGHTS.complianceHistory +
      communication * WEIGHTS.communicationScore;

    const trustScore = Math.round(clamp(rawScore, 0, 1) * 100);

    this.logger.debug(
      `Producer trust scored: ${trustScore}`,
      { trustScore },
    );

    return { trustScore };
  }
}
