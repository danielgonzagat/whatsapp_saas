import { Injectable, Logger } from '@nestjs/common';
import type { AngleFatigue } from './types';

interface AngleFatigueInput {
  readonly angleId: string;
  readonly workspaceId: string;
  readonly impressionCount: number;
  readonly ctrCurrent: number;
  readonly ctrBaseline: number;
  readonly conversionCurrent: number;
  readonly conversionBaseline: number;
}

const FATIGUE_HIGH_THRESHOLD = 0.7;
const FATIGUE_MODERATE_THRESHOLD = 0.4;
const CTR_WEIGHT = 0.6;
const CONV_WEIGHT = 0.4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

@Injectable()
export class AngleFatigueDetectorService {
  private readonly logger = new Logger(AngleFatigueDetectorService.name);

  detect(input: AngleFatigueInput): AngleFatigue {
    const ctrDeclineRate = input.ctrBaseline > 0
      ? clamp((input.ctrBaseline - input.ctrCurrent) / input.ctrBaseline, 0, 1)
      : 0;

    const conversionDeclineRate = input.conversionBaseline > 0
      ? clamp((input.conversionBaseline - input.conversionCurrent) / input.conversionBaseline, 0, 1)
      : 0;

    const fatigueScore = clamp(
      ctrDeclineRate * CTR_WEIGHT + conversionDeclineRate * CONV_WEIGHT,
      0,
      1,
    );

    const recommendation = this.determineRecommendation(fatigueScore);

    this.logger.debug(
      `Angle ${input.angleId} fatigue: ${fatigueScore.toFixed(3)} (${recommendation})`,
    );

    return {
      angleId: input.angleId,
      workspaceId: input.workspaceId,
      fatigueScore: Math.round(fatigueScore * 1000) / 1000,
      impressionCount: input.impressionCount,
      ctrDeclineRate: Math.round(ctrDeclineRate * 1000) / 1000,
      conversionDeclineRate: Math.round(conversionDeclineRate * 1000) / 1000,
      fatigueThreshold: FATIGUE_MODERATE_THRESHOLD,
      recommendation,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private determineRecommendation(fatigueScore: number): 'rotate' | 'rest' | 'still_fresh' {
    if (fatigueScore >= FATIGUE_HIGH_THRESHOLD) return 'rotate';
    if (fatigueScore >= FATIGUE_MODERATE_THRESHOLD) return 'rest';
    return 'still_fresh';
  }

  isFatigued(fatigue: AngleFatigue): boolean {
    return fatigue.fatigueScore >= FATIGUE_MODERATE_THRESHOLD;
  }
}
