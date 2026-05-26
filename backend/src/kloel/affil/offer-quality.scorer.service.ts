import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import type { OfferQualityInput, OfferQualityOutput } from './affil.types';
import { clamp } from '../../common/math';

type Classification = OfferQualityOutput['classification'];

const WEIGHTS = {
  commissionPct: 0.25,
  conversionRateHistorical: 0.30,
  supportQuality: 0.15,
  refundRatePenalty: 0.15,
  audienceFitScore: 0.15,
} as const;

const SCORE_EXCELLENT = 80;
const SCORE_GOOD = 65;
const SCORE_AVERAGE = 45;

function classify(score: number): Classification {
  if (score >= SCORE_EXCELLENT) return 'excellent';
  if (score >= SCORE_GOOD) return 'good';
  if (score >= SCORE_AVERAGE) return 'average';
  return 'poor';
}

function recommendationFor(classification: Classification): string {
  switch (classification) {
    case 'excellent':
      return 'Priorizar esta oferta. Alta qualidade e bom potencial de ganho.';
    case 'good':
      return 'Oferta sólida. Vale investir tráfego com moderação.';
    case 'average':
      return 'Oferta mediana. Monitorar performance de perto.';
    case 'poor':
      return 'Evitar esta oferta. Risco elevado de prejuízo.';
  }
}

@Injectable()
export class OfferQualityScorerService {
  private readonly logger = StructuredLogger.from(OfferQualityScorerService.name);

  score(offer: OfferQualityInput): OfferQualityOutput {
    const commissionNorm = clamp(offer.commissionPct / 100, 0, 1);
    const conversion = clamp(offer.conversionRateHistorical, 0, 1);
    const support = clamp(offer.supportQuality, 0, 1);
    const refundPenalty = 1 - clamp(offer.refundRate, 0, 1);
    const audienceFit = clamp(offer.audienceFitScore, 0, 1);

    const rawScore =
      commissionNorm * WEIGHTS.commissionPct +
      conversion * WEIGHTS.conversionRateHistorical +
      support * WEIGHTS.supportQuality +
      refundPenalty * WEIGHTS.refundRatePenalty +
      audienceFit * WEIGHTS.audienceFitScore;

    const score = Math.round(clamp(rawScore, 0, 1) * 100);
    const classification = classify(score);
    const recommendation = recommendationFor(classification);

    this.logger.debug(
      `Offer quality scored: ${score} (${classification})`,
      { score, classification },
    );

    return { score, classification, recommendation };
  }
}
