import { Injectable, Logger } from '@nestjs/common';
import type { AudienceFit } from './types';
import { clamp } from '../../common/math';

interface AudienceFitInput {
  readonly audienceId: string;
  readonly offerId: string;
  readonly workspaceId: string;
  readonly demographicAlignment: number;
  readonly interestOverlap: number;
  readonly behavioralMatch: number;
  readonly purchaseIntentAlignment: number;
}

const WEIGHTS = {
  demographic: 0.25,
  interest: 0.35,
  behavioral: 0.25,
  purchaseIntent: 0.15,
} as const;

const FIT_THRESHOLD_STRONG = 0.7;
const FIT_THRESHOLD_MODERATE = 0.4;

@Injectable()
export class AudienceFitDetectorService {
  private readonly logger = new Logger(AudienceFitDetectorService.name);

  detect(input: AudienceFitInput): AudienceFit {
    const fitScore = clamp(
      input.demographicAlignment * WEIGHTS.demographic +
        input.interestOverlap * WEIGHTS.interest +
        input.behavioralMatch * WEIGHTS.behavioral +
        input.purchaseIntentAlignment * WEIGHTS.purchaseIntent,
      0,
      1,
    );

    this.logger.debug(
      `Audience ${input.audienceId} fit for offer ${input.offerId}: ${fitScore.toFixed(3)}`,
    );

    return {
      audienceId: input.audienceId,
      offerId: input.offerId,
      workspaceId: input.workspaceId,
      fitScore: Math.round(fitScore * 1000) / 1000,
      demographicAlignment: input.demographicAlignment,
      interestOverlap: input.interestOverlap,
      behavioralMatch: input.behavioralMatch,
      purchaseIntentAlignment: input.purchaseIntentAlignment,
      evaluatedAt: new Date().toISOString(),
    };
  }

  getFitLevel(fit: AudienceFit): 'strong' | 'moderate' | 'weak' {
    if (fit.fitScore >= FIT_THRESHOLD_STRONG) {return 'strong';}
    if (fit.fitScore >= FIT_THRESHOLD_MODERATE) {return 'moderate';}
    return 'weak';
  }

  isViable(fit: AudienceFit): boolean {
    return fit.fitScore >= FIT_THRESHOLD_MODERATE;
  }
}
